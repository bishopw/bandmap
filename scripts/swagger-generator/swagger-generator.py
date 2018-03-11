#!/usr/bin/python3
"""
Generate the full Band Map swagger.yaml config from high level definitions
and templates.

I wanted to automate this because there are only 20 or so top-level resource
collections and object types (like /api/bands), but to provide all the
convenient, intuitive RESTful sub-collection addressing, the top-levels
decompose into over 100 sub-collections (like /api/bands/{band}/cities/{city}).

That would be a pain to write manual swagger config for all those, so this
script does it for us.
"""
from sys import exit
from copy import deepcopy
from collections import OrderedDict
import re
import ruamel.yaml as yaml

CommentedMap = yaml.comments.CommentedMap
CommentedSeq = yaml.comments.CommentedSeq

DEFINITIONS_FILE = 'definitions.yaml'
OUTPUT_FILE = 'swagger.yaml'

TOKEN_START = '{{'
TOKEN_END = '}}'
TOKEN_OPTIONAL = '?'

INDENT_SIZE = 2
YAML_LINE_WIDTH = 1000000 # Let devs wrap strings themselves with their editor.
ERR_FORMAT = 'Line {}: {}'

EMPTY_STRING = ''
EMPTY_LIST = []
EMPTY_DICT = {}
EMPTY_ORDERED_DICT = OrderedDict()
EMPTY_COMMENTED_MAP = CommentedMap()
EMPTY_COMMENTED_SEQ = CommentedSeq()

STRING_TYPE = type(EMPTY_STRING)
LIST_TYPE = type(EMPTY_LIST)
DICT_TYPE = type(EMPTY_DICT)
ORDERED_DICT_TYPE = type(EMPTY_ORDERED_DICT)
COMMENTED_MAP_TYPE = type(EMPTY_COMMENTED_MAP)
COMMENTED_SEQ_TYPE = type(EMPTY_COMMENTED_SEQ)
DICT_TYPES = [DICT_TYPE, ORDERED_DICT_TYPE, COMMENTED_MAP_TYPE]
LIST_TYPES = [LIST_TYPE, COMMENTED_SEQ_TYPE]
NONE_TYPE = type(None)

STANDARD_FIELDS = ['id', 'link', 'name']
IGNORE_FIELDS = ['__gen__'] # Ignore generator directives after parsing them.
NESTED_FIELDS = ['properties', 'items',
    # Treat the simple collection items fields in collection objects as plain
    # nested fields, rather than actual subcollection or *Count fields.
    'collectionItems', 'collectionItemsCount']
COUNT_FIELD_REGEX = r'([\S]+)Count'

LINK_EXAMPLE_BASE = 'https://www.seattlebandmap.com/api'

TLO_CROSS_REFERENCE = {
    'camelCasePluralToCodeSingular': OrderedDict(),
    'camelCaseSingularToCodeSingular': OrderedDict()
}

"""
Utility Functions
"""

def decapitalize(s):
    return s[:1].lower() + s[1:] if s else ''

def is_iterable(o):
    try:
        check_if_iterable = iter(o)
    except TypeError:
        return False
    return True

"""
Don't put reference/anchor aliases in our output json.  Swagger tools don't
like them and neither do I.
From: http://pyyaml.org/ticket/91:
"""
RoundTripDumperNoAliases = yaml.RoundTripDumper
RoundTripDumperNoAliases.ignore_aliases = lambda self, data: True
def dump_yaml(object):
    """
    Dump an object to a YAML string with appropriate settings.
    """
    return yaml.dump(
        object,
        width=YAML_LINE_WIDTH,
        Dumper=RoundTripDumperNoAliases)

def load_yaml(stream_or_string):
    """
    Load a YAML stream or string into a
    CommentedMap object with appropriate settings.
    """
    return yaml.load(stream_or_string, yaml.RoundTripLoader)

def commented_map_index(c_map, key):
    """Return the index of a key in a ruaml yaml commented map, or -1."""
    i = 0
    for k in c_map.keys():
        if k == key:
            return i
        i += 1
    return -1

def comment_map_replace(c_map, key, val, new_key=None):
    if new_key is None:
        new_key = key
    i = commented_map_index(c_map, key)
    c_map.pop(key)
    c_map.insert(i, new_key, val)

def get_collection_url(tlo_schema):
    tokens = get_tokens(tlo_schema)
    url_plural = tokens.get('urlPlural', 'objects')
    gd = get_gen_directive(tlo_schema)
    namespace = gd.get('namespace', '')
    if len(namespace) > 0:
        namespace += '/'
    return '{}/{}{}'.format(LINK_EXAMPLE_BASE, namespace, url_plural)

def get_item_url(tlo_schema):
    return '{}/{}'.format(get_collection_url(tlo_schema), 123)

def replace_url_nodes_with_examples(url):
    """Replace '{item-type}' with '123' example ids for now."""
    nodes = url.split('/')
    for i in range(len(nodes)):
        n = nodes[i]
        if n.startswith('{') and n.endswith('}'):
            nodes[i] = '123'
    return '/'.join(nodes)

"""
Token Lookup and Replacement
"""

def find_key_in_defs(key, defs):
    """Search backwards through definitions list for key."""
    level = len(defs) - 1
    while level >= 0:
        if key in defs[level]:
            return defs[level][key]
        level -= 1
    return None

def find_key_in_tokens(key, tokens):
    """Search backwards through tokens list for key."""
    level = len(tokens) - 1
    while level >= 0:
        if key in tokens[level]:
            return tokens[level][key]
        level -= 1
    return None

def find_key_in_tokens_reverse(key, tokens):
    """Search forwards through tokens list for key.  Not usually used."""
    level = 0
    while level < len(tokens):
        if key in tokens[level]:
            return tokens[level][key]
        level += 1
    return None

def replace_tokens_in_string(s, defs, errors, final_pass=False):
    """
    Recursively replace {{token}}s in string s with token definitions in defs.
    """
    # While there are tokens found:
    seek_from = 0
    token_start = s.find(TOKEN_START, seek_from)
    while token_start != -1:

        # Parse out token.
        seek_from = token_start + len(TOKEN_START)
        token_end = s.find(TOKEN_END, seek_from)
        if token_end == -1:
            errors.append(
                "Unclosed template text token '{}...'.".format(
                    s[token_start:token_start+20]))
            token_start = s.find(TOKEN_START, seek_from)
            continue
        token_end += len(TOKEN_END)
        token = s[token_start+len(TOKEN_START):token_end-len(TOKEN_END)]
        token_val = None
        token_key_val = token.split('=')
        token_key = token_key_val[0]
        token_optional = (
            token_key[-len(TOKEN_OPTIONAL)] == TOKEN_OPTIONAL)
        if token_optional:
            token_key = token_key[:-len(TOKEN_OPTIONAL)]

        token_val = find_key_in_defs(token_key, defs)

        # If no token definition was found, check if the token has a
        # '{{token=default}}' style default.
        if token_val == None:
            if len(token_key_val) > 1:
                token_val = token_key_val[1]

            # If not, no replacement could be found for this token:
            else:
                # If it's an optional token (key ends with an optional
                # marker), replace it with an empty string.
                if token_optional:
                    token_val = EMPTY_STRING
                else:
                    # Otherwise leave token as is, record an error if this is
                    # the final pass, and continue to next token.
                    if final_pass:
                        errors.append(
                            'No definition found for token {}{}{}.'.format(
                                '{{', token_key, '}}'))
                    seek_from = token_end
                    token_start = s.find(TOKEN_START, seek_from)
                    continue

        # A replacement was found.
        # Recursively replace internal tokens in the replacement text:
        token_val = replace_tokens_in_string(token_val, defs, errors)

        # Replace the token with the completed replacement.
        s = '{}{}{}'.format(s[:token_start], token_val, s[token_end:])

        # Set seek cursor to end of replaced token and continue.
        seek_from = token_start + len(token_val)
        token_start = s.find(TOKEN_START, seek_from)

    return s

def replace_tokens_in_list(l, defs, errors, final_pass=False):
    new_list = []
    for i in l:
        new_i = deepcopy(i)
        if type(i) == STRING_TYPE:
            new_i = replace_tokens_in_string(new_i, defs, errors, final_pass)
        elif type(i) in LIST_TYPES:
            new_i = replace_tokens_in_list(new_i, defs, errors, final_pass)
        elif is_iterable(i):
            replace_tokens_in_c_map(new_i, defs, errors, final_pass)
        new_list.append(new_i)
    return new_list

def replace_tokens_in_c_map(c_map, defs, errors, final_pass=False):
    """
    Recursively replace {{token}}s in object o and its sub-objects with token
    definitions in defs.
    """
    if not is_iterable(c_map):
        return # This object doesn't have properties.  Nothing to replace.

    # Collect replacements.
    replacements = []
    for k, v in c_map.items():

        if type(v) == STRING_TYPE:
            replacements.append([k,
                replace_tokens_in_string(v, defs, errors, final_pass)])

        elif type(v) in LIST_TYPES:
            replacements.append([k,
                replace_tokens_in_list(v, defs, errors, final_pass)])

        elif is_iterable(v):
            replace_tokens_in_c_map(v, defs, errors)

    # Apply replacements (can't do it inline when iterating an ordered dict):
    for r in replacements:
        comment_map_replace(c_map, r[0], r[1])

"""
Schema Wrangling
"""

def separate_words(s):
    """Convert 'camelOrTitleCaseName' to 'camel or title case name'."""
    return re.sub(r'([A-Z])', r' \1', s).lower().strip()

def combine_words(s):
    """Convert 'separate words name' to 'SeparateWordsName'."""
    return ''.join([w.capitalize() for w in s.split(' ')])

def fill_out_name_tokens(code_singular, name_tokens):
    t = name_tokens
    singular = (t['singular'] if 'singular' in t
        else separate_words(code_singular))
    plural = t['plural'] if 'plural' in t else '{}s'.format(singular)
    capSingular = singular.capitalize()
    capPlural = plural.capitalize()
    urlSingular = (t['urlSingular'] if 'urlSingular' in t else
        singular.replace(' ', '-'))
    urlPlural = (t['urlPlural'] if 'urlPlural' in t else
        plural.replace(' ', '-'))
    codeSingular = (t['codeSingular'] if 'codeSingular' in t else
        combine_words(singular))
    codePlural = (t['codePlural'] if 'codePlural' in t else
        combine_words(plural))
    camelCaseSingular = decapitalize(codeSingular)
    camelCasePlural = decapitalize(codePlural)

    # Worry about the YAML ordering: put names at the top of definitions.
    t.pop('singular', None)
    t.pop('plural', None)
    t.pop('capSingular', None)
    t.pop('capPlural', None)
    t.pop('urlSingular', None)
    t.pop('urlPlural', None)
    t.pop('codeSingular', None)
    t.pop('codePlural', None)
    t.pop('camelCaseSingular', None)
    t.pop('camelCasePlural', None)
    t.insert(0, 'singular', singular)
    t.insert(1, 'plural', plural)
    t.insert(2, 'capSingular', capSingular)
    t.insert(3, 'capPlural', capPlural)
    t.insert(4, 'urlSingular', urlSingular)
    t.insert(5, 'urlPlural', urlPlural)
    t.insert(6, 'codeSingular', codeSingular)
    t.insert(7, 'codePlural', codePlural)
    t.insert(8, 'camelCaseSingular', camelCaseSingular)
    t.insert(9, 'camelCasePlural', camelCasePlural)

def name_top_level_objects(tlos):
    """
    First pass over top level objects from defintions file: learn Object Names.
    We have to do this initial pass ahead of time so we will know when one of
    the subfield names we are looking at during the second pass does in fact
    represent a subcollection (of another top level object type) or not.
    """

    # For each object:
    for k, o in tlos.items():
        # Check __gen__ directive for special names.
        # Read/infer singular/plural/description/url/code names of object.
        t = get_tokens(o)
        fill_out_name_tokens(k, t)

        # Add __gen__.tokens to TLO if none existed before.
        o['__gen__'] = (o['__gen__'] if '__gen__' in o
            else CommentedMap(OrderedDict()))
        o['__gen__']['tokens'] = t

        # Also maintain the TLO_CROSS_REFERENCE tables.
        TLO_CROSS_REFERENCE['camelCasePluralToCodeSingular'][
            t['camelCasePlural']] = t['codeSingular']
        TLO_CROSS_REFERENCE['camelCaseSingularToCodeSingular'][
            t['camelCaseSingular']] = t['codeSingular']

def get_gen_directive(obj):
    if type(obj) not in DICT_TYPES:
        return CommentedMap(OrderedDict())
    if '__gen__' not in obj:
        obj['__gen__'] = CommentedMap(OrderedDict())
    return obj['__gen__']

def get_tokens(obj, s_type=None):
    gen_directive = get_gen_directive(obj)
    if 'tokens' not in gen_directive:
        gen_directive['tokens'] = CommentedMap(OrderedDict())

    rval = deepcopy(gen_directive['tokens'])

    # Also get any tokens specific to individual requested methods or
    # schema types from getTokens, postTokens, patchTokens, etc. subfields.
    if s_type is not None:
        try:
            methods = s_type['methods']
        except KeyError as ke:
            print(dump_yaml({'KeyError from s_type': s_type}))
            raise
        # Method-specific tokens:
        for m in methods:
            rval.update(gen_directive.get('{}Tokens'.format(m.lower()), {}))
        # Schema-type-specific tokens:
        rval.update(gen_directive.get('{}Tokens'.format(s_type['name']), {}))

    return rval

"""
Schema Types
"""

SCHEMA_TYPE_DEFAULTS = {
    'name': 'default',
    'suffix': '',
    'methods': [],
    'standard_fields': {
        'id': 'id',
        'link': 'link',
        'name': 'name',
        'objectsCount': 'objectsCount'
    },
    'explainIds': ['', ''],
    'explain_array_replacement': None,
    'for_new_only': False,
    'include_count_fields': False,
    'include_required_fields': False,
    'include_default_empty_arrays': False,
    'explain_field_presence': False,
    'explain_optional_fields': False,
    'include_warnings': False,
    'add_warnings_version': False,
    'internal_s_type': {}
}
SCHEMA_TYPE_DEFAULTS['internal_s_type'] = SCHEMA_TYPE_DEFAULTS

GET_SCHEMA_TYPE = {
    'name': 'get',
    'suffix': '',
    'methods': ['GET'],
    'standard_fields': {
        'id': 'id',
        'link': 'link',
        'name': 'name',
        'objectsCount': 'objectsCount'
    },
    'add_warnings_version': True,
    'include_count_fields': True,
    'explain_field_presence': True
}
GET_SCHEMA_TYPE['internal_s_type'] = GET_SCHEMA_TYPE

POST_SCHEMA_TYPE_INTERNAL = {
    'name': 'postInternal',
    'suffix': 'Post',
    'methods': ['POST'],
    'description': 'selectOrPostDescription',
    'subTloDescription': 'subTloDescriptionPost',
    'standard_fields': {
        'id': 'idSelectOrPost',
        'name': 'nameSelectOrPost'
    },
    'explainIds': ['selectOrPostExplainOneId', 'selectOrPostExplainTwoIds'],
    'for_new_only': True,
    'include_default_empty_arrays': True,
    'explain_optional_fields': True
}
POST_SCHEMA_TYPE_INTERNAL['internal_s_type'] = POST_SCHEMA_TYPE_INTERNAL

POST_SCHEMA_TYPE = {
    'name': 'post',
    'suffix': 'Post',
    'methods': ['POST'],
    'description': 'postDescription',
    'standard_fields': {
        'name': 'namePost'
    },
    'for_new_only': True,
    'include_required_fields': True,
    'include_default_empty_arrays': True,
    'explain_optional_fields': True,
    'internal_s_type': POST_SCHEMA_TYPE_INTERNAL
}

PATCH_SCHEMA_TYPE_INTERNAL = deepcopy(POST_SCHEMA_TYPE_INTERNAL)
PATCH_SCHEMA_TYPE_INTERNAL.update({
    'name': 'patchInternal',
    'suffix': 'Patch',
    'methods': ['PATCH'],
    'subTloDescription': 'subTloDescriptionPost',
    'for_new_only': False,
    'include_default_empty_arrays': False,
    'explain_array_replacement': 'explainArrayReplacement',
    'internal_s_type': PATCH_SCHEMA_TYPE_INTERNAL
})

PATCH_SCHEMA_TYPE = {
    'name': 'patch',
    'suffix': 'Patch',
    'methods': ['PATCH'],
    'description': 'patchDescription',
    'standard_fields': {
        'id': 'idPatch',
        'name': 'namePatch'
    },
    'explainIds': ['selectOrModifyExplainOneId', 'selectOrModifyExplainTwoIds'],
    'explain_array_replacement': 'explainArrayReplacement',
    'for_new_only': True,
    'explain_optional_fields': True,
    'internal_s_type': PATCH_SCHEMA_TYPE_INTERNAL
}

PUT_SCHEMA_TYPE_INTERNAL = deepcopy(POST_SCHEMA_TYPE_INTERNAL)
PUT_SCHEMA_TYPE_INTERNAL.update({
    'name': 'putInternal',
    'suffix': 'Put',
    'methods': ['PUT'],
    'subTloDescription': 'subTloDescriptionPost',
    'internal_s_type': PUT_SCHEMA_TYPE_INTERNAL
})

PUT_SCHEMA_TYPE = {
    'name': 'put',
    'suffix': 'Put',
    'methods': ['PUT'],
    'description': 'putDescription',
    'standard_fields': {
        'id': 'idPut',
        'name': 'namePut'
    },
    'explainIds': [
        'selectOrReplaceExplainOneId',
        'selectOrReplaceExplainTwoIds'
    ],
    'for_new_only': True,
    'include_required_fields': True,
    'explain_array_replacement': 'explainArrayReplacement',
    'explain_optional_fields': True,
    'internal_s_type': PUT_SCHEMA_TYPE_INTERNAL
}

PATCH_ONE_SCHEMA_TYPE_INTERNAL = deepcopy(PATCH_SCHEMA_TYPE_INTERNAL)
PATCH_ONE_SCHEMA_TYPE_INTERNAL.update({
    'name': 'patchOneInternal',
    'suffix': 'PatchOne',
    'subTloDescription': 'subTloDescriptionPost',
    'explain_array_replacement': 'explainArrayReplacementOne',
    'internal_s_type': PATCH_SCHEMA_TYPE_INTERNAL
})

PATCH_ONE_SCHEMA_TYPE = {
    'name': 'patchOne',
    'suffix': 'PatchOne',
    'methods': ['PATCH'],
    'description': 'patchOneDescription',
    'subTloDescription': 'subTloDescriptionPatch',
    'standard_fields': {
        'name': 'namePatchOne'
    },
    'include_warnings': True,
    'explain_array_replacement': 'explainArrayReplacementOne',
    'explain_optional_fields': True,
    'internal_s_type': PATCH_ONE_SCHEMA_TYPE_INTERNAL
}

PUT_ONE_SCHEMA_TYPE_INTERNAL = deepcopy(PUT_SCHEMA_TYPE_INTERNAL)
PUT_ONE_SCHEMA_TYPE_INTERNAL.update({
    'name': 'putOneInternal',
    'subTloDescription': 'subTloDescriptionPost',
    'suffix': 'PutOne'
})

PUT_ONE_SCHEMA_TYPE = {
    'name': 'putOne',
    'suffix': 'PutOne',
    'methods': ['PUT'],
    'description': 'putOneDescription',
    'subTloDescription': 'subTloDescriptionPost',
    'standard_fields': {
        'name': 'namePost'
    },
    'include_warnings': True,
    'include_required_fields': True,
    'explain_optional_fields': True,
    'internal_s_type': PUT_ONE_SCHEMA_TYPE_INTERNAL
}

PATCH_SCHEMA_TYPE_SUBCOLLECTION = deepcopy(PATCH_SCHEMA_TYPE_INTERNAL)
PATCH_SCHEMA_TYPE_SUBCOLLECTION.update({
    'name': 'patchSubcollection',
    'description': 'selectOrModifyDescription',
    'subTloDescription': 'subTloDescriptionPatch',
    'standard_fields': {
        'id': 'idSelectOrModify',
        'name': 'nameSelectOrModify'
    },
    'explainIds': ['selectOrModifyExplainOneId', 'selectOrModifyExplainTwoIds'],
    'internal_s_type': PATCH_SCHEMA_TYPE_INTERNAL
})

PUT_SCHEMA_TYPE_SUBCOLLECTION = deepcopy(PUT_SCHEMA_TYPE_INTERNAL)
PUT_SCHEMA_TYPE_SUBCOLLECTION.update({
    'name': 'putSubcollection',
    'description': 'replaceOrCreateDescription',
    'subTloDescription': 'subTloDescriptionPatch',
    'standard_fields': {
        'id': 'idReplaceOrCreate',
        'name': 'nameReplaceOrCreate'
    },
    'explainIds': ['replaceOrCreateExplainOneId', 'replaceOrCreateExplainTwoIds'],
    'internal_s_type': PUT_SCHEMA_TYPE_INTERNAL
})

# Order of elements matters in these arrays for get_filtered_schema_types().
SCHEMA_TYPES = [
    GET_SCHEMA_TYPE,
    POST_SCHEMA_TYPE,
    PATCH_SCHEMA_TYPE,
    PUT_SCHEMA_TYPE,
    PATCH_ONE_SCHEMA_TYPE,
    PUT_ONE_SCHEMA_TYPE
]

SUBCOLLECTION_SCHEMA_TYPES = [
    GET_SCHEMA_TYPE,
    POST_SCHEMA_TYPE_INTERNAL,
    PATCH_SCHEMA_TYPE_SUBCOLLECTION,
    PUT_SCHEMA_TYPE_SUBCOLLECTION,
    PATCH_ONE_SCHEMA_TYPE,
    PUT_ONE_SCHEMA_TYPE
]

def get_filtered_schema_types(methods, schema_types):
    """Map schema types to methods and filter them."""
    sts = []
    if 'GET' in methods:
        sts.append(schema_types[0])
    if 'POST' in methods:
        sts.append(schema_types[1])
    if 'PATCH' in methods:
        sts.append(schema_types[2])
    if 'PUT' in methods:
        sts.append(schema_types[3])
    if 'PATCH' in methods:
        sts.append(schema_types[4])
    if 'PUT' in methods:
        sts.append(schema_types[5])
    return sts

"""
Definition Generation
"""

def get_field_type(src_field_name, src_schema):
    field_type_override = get_gen_directive(src_schema).get('fieldType', None)
    if field_type_override is not None:
        return field_type_override
    if type(src_schema) == STRING_TYPE and src_field_name == 'description':
        return 'description'
    if src_field_name == 'activeDates':
        return 'active_dates'
    if src_field_name in STANDARD_FIELDS:
        return 'standard'
    if src_field_name in NESTED_FIELDS:
        return 'nested'
    xref = TLO_CROSS_REFERENCE['camelCaseSingularToCodeSingular']
    sc_tlo = xref.get(src_field_name)
    if sc_tlo is not None:
        return 'sub_tlo'
    xref = TLO_CROSS_REFERENCE['camelCasePluralToCodeSingular']
    sc_tlo = xref.get(src_field_name)
    if sc_tlo is not None:
        return 'subcollection'
    if re.search(COUNT_FIELD_REGEX, src_field_name):
        return 'count'
    return 'inline'

FIELD_PROPERTY_ORDER = [
    'type',
    'format',
    'enum',
    'title',
    'description',
    'default',

    # Validation properties:
    'minimum',
    'exclusiveMinimum',
    'maximum',
    'exclusiveMaximum',
    'minLength',
    'maxLength',
    'minItems',
    'maxItems',
    'minProperties',
    'maxProperties',
    'uniqueItems',
    'multipleOf',
    'pattern',
    'required',

    'example',

    '$ref',
    'items',
    'allOf',
    'properties',
    'additionalProperties'
]

def add_field_properties(context, dest_schema, prioritized_src_schemas):
    for field_property_name in FIELD_PROPERTY_ORDER:
        try:
            prop_val = find_key_in_tokens(
                field_property_name, prioritized_src_schemas)
        except TypeError as te:
            print('TypeError: {}'.format(te))
            print('prioritized_src_schemas: {}'.format(prioritized_src_schemas))
            raise te

        if prop_val is not None:
            if type(prop_val) == STRING_TYPE:
                tokens = context['tokens']
                prop_val = replace_tokens_in_string(prop_val,
                    tokens, [], final_pass=True).strip()
            dest_schema[field_property_name] = prop_val

def get_tlo_override(context, src_schema):
    return context['tlos'].get(
        get_gen_directive(src_schema).get('topLevelObject', ''), None)

SUBCOLLECTION_DEFAULTS = CommentedMap(OrderedDict({
    'type': 'array',
    'description': 'An array containing the subcollection objects.',
    'minItems': 0,
    'uniqueItems': True
}))
SUBCOLLECTION_DEFAULTS_W_EMPTY_ARRAY = deepcopy(SUBCOLLECTION_DEFAULTS)
SUBCOLLECTION_DEFAULTS_W_EMPTY_ARRAY['default'] = []
SUBCOLLECTION_DEFAULTS['items'] = None
SUBCOLLECTION_DEFAULTS_W_EMPTY_ARRAY['items'] = None

def get_id_fields(src_schema):
    id_field_names = ['id', 'name']
    id_fields = []
    for field_name, field in src_schema.items():
        gd = get_gen_directive(field)
        if gd.get('isId', False):
            id_field_names.append(field_name)
    for fn in id_field_names:
        if fn in src_schema:
            id_fields.append(fn)
    if len(id_fields) == 0:
        # Tags have no id field, but are themselves strings.
        id_fields.append('string')
    return id_fields

def describe_ids(src_schema):
    id_fields = get_id_fields(src_schema)
    if len(id_fields) > 1:
        return '{} or {}'.format(id_fields[0], id_fields[1])
    if len(id_fields) > 0:
        return id_fields[0]
    return ''

def explain_ids(src_schema, s_type, tokens):
    id_fields = get_id_fields(src_schema)
    std_field_names = s_type.get('explainIds', ['', ''])
    if len(id_fields) > 1:
        sf = find_key_in_tokens(std_field_names[1], tokens)
    else:
        sf = find_key_in_tokens(std_field_names[0], tokens)
    sf = sf if sf is not None else ''
    return sf

def add_parent_names(new_tokens, parent_tokens):
    new_tokens.update({
        'parentSingular': find_key_in_tokens('singular', parent_tokens),
        'parentPlural': find_key_in_tokens('plural', parent_tokens),
        'parentUrlSingular': find_key_in_tokens('urlSingular', parent_tokens),
        'parentUrlPlural': find_key_in_tokens('urlPlural', parent_tokens),
        'parentCodeSingular': find_key_in_tokens('codeSingular', parent_tokens),
        'parentCodePlural': find_key_in_tokens('codePlural', parent_tokens)
    })

def do_schema_type_modifications(src_schema, s_type):
    gd = get_gen_directive(src_schema)

    # Do general schema type modifications.
    if 'schemaTypeModifications' in gd:
        s_type.update(gd['schemaTypeModifications'])

    # Do schema-type-specific modifications.
    stsMods = '{}SchemaTypeModifications'.format(s_type['name'])
    if stsMods in gd:
        s_type.update(gd[stsMods])

    return s_type

def prepare_new_tokens(
    tokens, src_schema, tlo_schema, s_type, new_parents=True):
    """
    Prepare a new layer of tokens for a new nested subcollection/schema type.
    """
    src_schema_items = src_schema.get('items', src_schema)
    src_schema_props = src_schema_items.get('properties', src_schema)

    new_tokens = deepcopy(get_tokens(tlo_schema, s_type=s_type))
    if new_parents == True:
        add_parent_names(new_tokens, tokens)
    id_fields = get_id_fields(src_schema_props)
    new_tokens['idFields'] = describe_ids(src_schema_props)
    new_tokens['primaryIdField'] = id_fields[0]
    new_tokens['secondaryIdField'] = ''
    if len(id_fields) > 1:
        new_tokens['secondaryIdField'] = id_fields[1]
        new_tokens['paramDescription'] = find_key_in_tokens(
            'paramDescriptionTwoIds', tokens)
    else:
        new_tokens['paramDescription'] = find_key_in_tokens(
            'paramDescriptionOneId', tokens)
    new_tokens['explainIds'] = explain_ids(src_schema_props, s_type, tokens)
    if s_type.get('explain_field_presence', False) == False:
        new_tokens['onlyPresent'] = ''
        new_tokens['onlyPresentArray'] = ''
    else:
        new_tokens['onlyPresent'] = find_key_in_tokens_reverse(
            'onlyPresent', tokens)
        new_tokens['onlyPresentArray'] = find_key_in_tokens_reverse(
            'onlyPresentArray', tokens)
    if s_type.get('explain_optional_fields', False) == False:
        new_tokens['optional'] = ''
        new_tokens['nOptional'] = ''
    else:
        new_tokens['optional'] = find_key_in_tokens_reverse('optional', tokens)
        new_tokens['nOptional'] = find_key_in_tokens_reverse(
            'nOptional', tokens)
    if s_type.get('for_new_only', False) == False:
        new_tokens['forNewOnly'] = ''
    else:
        new_tokens['forNewOnly'] = find_key_in_tokens_reverse(
            'forNewOnly', tokens)
    return new_tokens

def get_basic_fields(src_schema_props, tlo_schema_props):
    """
    Assemble "basic" fields (id, link, name, or other isId fields) for
    sub-tlo schema, if none are provided, then treat this field as nested.
    """
    field_names = []
    for f in STANDARD_FIELDS:
        if f in tlo_schema_props or f in src_schema_props:
            field_names.append(f)

    # Also include non-standard id fields.
    id_fields = get_id_fields(tlo_schema_props)
    for prop_name in id_fields:
        if prop_name not in field_names and prop_name not in STANDARD_FIELDS:
            field_names.append(prop_name)

    basic_fields = CommentedMap(OrderedDict())
    for fn in field_names:
        if fn in src_schema_props:
            basic_fields[fn] = src_schema_props[fn]
        elif fn in tlo_schema_props:
            basic_fields[fn] = tlo_schema_props[fn]

    return basic_fields

def make_description_field(context,
    src_field_name, src_schema, tlo_schema, url, s_type):

    tokens = context['tokens']

    if type(src_schema) != STRING_TYPE and type(tlo_schema) == STRING_TYPE:
        src_schema = tlo_schema

    dest_schema = replace_tokens_in_string(src_schema,
        tokens, [], final_pass=True).strip()
    return dest_schema

def make_standard_field(context,
    src_field_name, src_schema, tlo_schema, url, s_type):

    dest_schema = CommentedMap(OrderedDict())
    tokens = context['tokens']

    std_field_names = s_type['standard_fields']
    std_fields = find_key_in_tokens('standardFields', tokens)
    std_field_name = std_field_names.get(src_field_name, EMPTY_STRING)
    std_schema = std_fields.get(std_field_name, {})

    # If the source schema overrides the field type, like for string ids, use
    # just the source schema.
    # If the source schema contains other property overrides or extra
    # properties for this field (probably just description), use those instead.
    if len(src_schema) > 0 and 'type' not in src_schema:
        combined_schema = CommentedMap(OrderedDict())
        for prop_name in FIELD_PROPERTY_ORDER:
            if prop_name in src_schema:
                combined_schema[prop_name] = src_schema[prop_name]
            elif prop_name in std_schema:
                combined_schema[prop_name] = std_schema[prop_name]
        src_schema = combined_schema

    prioritized_src_schemas = [
        tlo_schema,
        std_schema,
        src_schema
    ]

    # Prepare some special case default properties.
    if src_field_name == 'link':
        prioritized_src_schemas.insert(0, {'example': url})
    elif src_field_name == 'name':
        example_name = find_key_in_tokens('singular', tokens)
        example_name = example_name.split(' ')
        example_name = ' '.join([word.capitalize() for word in example_name])
        example_name = '{} Name'.format(example_name)
        prioritized_src_schemas.insert(0, {'example': example_name})

    add_field_properties(context, dest_schema, prioritized_src_schemas)
    return dest_schema

def make_count_field(context,
    src_field_name, src_schema, tlo_schema, url, s_type):

    return make_standard_field(context,
        'objectsCount', src_schema, tlo_schema, url, s_type)

def make_inline_field(context,
    src_field_name, src_schema, tlo_schema, url, s_type):
    tokens = context['tokens']
    tlos = context['tlos']

    dest_schema = src_schema

    # Treat inline fields with properties just like nested fields.
    if type(dest_schema) in DICT_TYPES:
        dest_schema = make_nested_field(context,
            src_field_name, src_schema, tlo_schema, url, s_type)

    # Else the inline field's value is a simple string/integer.
    # Just do string replacements and return.
    else:
        if type(dest_schema) == STRING_TYPE:
            tokens = context['tokens']
            dest_schema = replace_tokens_in_string(dest_schema,
                tokens, [], final_pass=True).strip()

    return dest_schema

def make_sub_tlo_field(context,
    src_field_name, src_schema, tlo_schema, url, s_type):
    """
    A "sub-tlo" field is one like "state" within a City object - not a sub-
    collection but a reference to a single other top level object type.
    The schema should include just the referencing fields (id, link, name, isId)
    for the other tlo.
    """

    tlos = context['tlos']
    tokens = context['tokens']

    # Look up the top level object, honoring tlo overrides.
    tlo_override = get_gen_directive(src_schema).get('topLevelObject')
    if tlo_override is not None:
        tlo_name = tlo_override
    else:
        tlo_name = (TLO_CROSS_REFERENCE['camelCaseSingularToCodeSingular']
            [src_field_name])
    tlo = tlos[tlo_name]

    # Descend to this schema type's internal schema type.
    sf_s_type = s_type['internal_s_type']

    # Assemble "basic" fields (id, link, name, or other isId fields) for
    # sub-tlo schema, if none are provided, then treat this field as nested.
    src_schema_props = src_schema.get('properties', CommentedMap(OrderedDict()))
    tlo_schema_props = tlo.get('properties', CommentedMap(OrderedDict()))
    nested_src_schema = get_basic_fields(src_schema_props, tlo_schema_props)

    # Include parent references for descriptions.
    new_tokens = prepare_new_tokens(tokens, nested_src_schema, tlo, s_type)
    tokens.append(new_tokens)

    # Add field description for this schema type.
    dest_schema = CommentedMap(OrderedDict())
    if src_schema is None or len(src_schema) == 0:
        src_schema = CommentedMap(OrderedDict())
    else:
        src_schema = deepcopy(src_schema)
    description = src_schema.get('description', None)
    if 'subTloDescription' in sf_s_type:
        description = find_key_in_tokens(sf_s_type['subTloDescription'], tokens)
    if description is None:
        description = find_key_in_tokens('subTloDescription', tokens)
    description = replace_tokens_in_string(
        description, tokens, [], final_pass=True)
    dest_schema['description'] = description

    # Change the estimated example TLO url.
    new_url = get_item_url(tlo)

    dest_schema['properties'] = make_nested_field(context,
        'properties', nested_src_schema, tlo_schema_props, new_url, sf_s_type)

    # Pop parent references.
    tokens.pop()

    return dest_schema

def make_active_dates_field(context,
    src_field_name, src_schema, tlo_schema, url, s_type):

    tlos = context['tlos']
    tokens = context['tokens']

    std_fields = find_key_in_tokens('standardFields', tokens)
    ad_schema = deepcopy(std_fields['activeDates'])

    # Add properties using the activeDates standard field schema
    # as the fields list.
    # But replace all descriptions with the src_schema descriptions where
    # available.
    src_description = src_schema.get('description')
    if (src_description is not None):
        ad_schema['description'] = src_description
    src_items = src_schema.get('items', {})
    src_items_description = src_items.get('description')
    if (src_items_description is not None):
        ad_schema['items']['description'] = src_items_description
    src_items_props = src_items.get('properties', {})
    src_from_desc = src_items_props.get('from', {}).get('description')
    if (src_from_desc is not None):
        ad_schema['items']['properties']['from']['description'] = src_from_desc
    src_untl_desc = src_items_props.get('until', {}).get('description')
    if (src_untl_desc is not None):
        ad_schema['items']['properties']['until']['description'] = src_untl_desc

    # Assemble tokens for the active dates subfields and push them onto
    # the top of the tokens stack.
    ad_tokens = prepare_new_tokens(tokens, ad_schema, ad_schema, s_type)
    tokens.append(ad_tokens)

    # Explain array replacement in the array description, if appropriate.
    if s_type.get('explain_array_replacement', None) is not None:
        ad_schema['description'] = '{}{}'.format(
            ad_schema['description'],
            find_key_in_tokens(s_type['explain_array_replacement'], tokens))

    dest_schema = CommentedMap(OrderedDict())
    add_or_ignore_all_fields(context, dest_schema,
        ad_schema, tlo_schema, url, s_type)

    # Pop active dates-specific tokens list.
    tokens.pop()

    return dest_schema

def make_nested_field(context,
    src_field_name, src_schema, tlo_schema, url, s_type):

    # Recursively add all subfields under this nested field.
    dest_schema = CommentedMap(OrderedDict())
    add_or_ignore_all_fields(context, dest_schema,
        src_schema, tlo_schema, url, s_type)

    return dest_schema

def make_subcollection_field(context,
    src_field_name, src_schema, tlo_schema, url, s_type):

    tlos = context['tlos']
    tokens = context['tokens']

    # If we got a source schema with no 'items' or 'properties' fields, it is
    # probably an unspecified "default" subcollection.  Use default fields.
    if ('items' not in src_schema or
        'properties' not in src_schema.get('items')):
        src_schema = create_default_subcollection_schema(
            context, src_field_name, src_schema)

    # Descend to this schema type's internal schema type.
    sc_s_type = s_type['internal_s_type']

    # Honor TLO overrides.
    tlo_override = get_gen_directive(src_schema).get('topLevelObject')
    if tlo_override is not None:
        nested_tlo_name = tlo_override
    else:
        nested_tlo_name = (TLO_CROSS_REFERENCE['camelCasePluralToCodeSingular']
            [src_field_name])

    # Add standard subcollection fields to the schema if they aren't overridden.
    combined_src_schema = CommentedMap(OrderedDict())
    sc_defaults = SUBCOLLECTION_DEFAULTS
    if sc_s_type.get('include_default_empty_arrays', False) == True:
        sc_defaults = SUBCOLLECTION_DEFAULTS_W_EMPTY_ARRAY
    for prop_name in FIELD_PROPERTY_ORDER:
        if prop_name in src_schema:
            combined_src_schema[prop_name] = src_schema[prop_name]
        elif prop_name in sc_defaults:
            combined_src_schema[prop_name] = sc_defaults[prop_name]
    src_schema = combined_src_schema

    # Use the root TLO schema for this subcollection's TLO type if available.
    # Be careful: The src_ and tlo_ schemas will go out of synch here until
    # execution descends through the src schema's 'items' and 'properties'
    # nested fields, so the tlo_schema will be worthless as a reference to any
    # fields from now until then.  We probably shouldn't need anything from the
    # tlo schema until then though.
    nested_tlo_schema = deepcopy(tlos.get(nested_tlo_name, tlo_schema))

    # Assemble tokens for the new internal subcollection and push them onto
    # the top of the tokens stack.
    sc_tokens = prepare_new_tokens(
        tokens, src_schema, nested_tlo_schema, sc_s_type)
    tokens.append(sc_tokens)

    # Append items and properties subschemas.
    if 'items' not in src_schema:
        src_schema['items'] = CommentedMap(OrderedDict())
    src_schema_items = src_schema['items']
    if 'properties' not in src_schema_items:
        if ('type' in src_schema_items and
            src_schema_items['type'] != 'object'):
            # If this is a subcollection of something other than objects,
            # like tags, we don't need a properties subfield.
            pass
        else:
            src_schema_items['properties'] = CommentedMap(OrderedDict())
    src_schema_props = src_schema_items.get('properties', {})

    # Explain array replacement in the array description, if appropriate.
    if sc_s_type.get('explain_array_replacement', None) is not None:
        src_schema['description'] = '{}  {}'.format(
            src_schema['description'],
            find_key_in_tokens(sc_s_type['explain_array_replacement'], tokens))

    # Override the top level item description for this schema type.
    # Example:
    #  GET: 'A band and its related band info.'
    # POST: 'A new band to create.'
    if ('description' in src_schema_items and 'description' in sc_s_type):
        d = find_key_in_tokens(sc_s_type['description'], tokens)
        if d is None:
            d = src_schema_items['description']
        src_schema_items['description'] = d

    # Change the estimated example TLO url.
    new_url = get_item_url(nested_tlo_schema)

    dest_schema = CommentedMap(OrderedDict())
    add_or_ignore_all_fields(context, dest_schema,
        src_schema, nested_tlo_schema, new_url, sc_s_type)

    # Pop the internal subcollection's tokens.
    tokens.pop()

    return dest_schema

FIELD_HANDLERS = {
    'description': make_description_field,
    'standard': make_standard_field,
    'count': make_count_field,
    'inline': make_inline_field,
    'sub_tlo': make_sub_tlo_field,
    'active_dates': make_active_dates_field,
    'nested': make_nested_field,
    'subcollection': make_subcollection_field
}
def add_or_ignore_field(context, defn,
    src_field_name, src_schema, tlo_schema, url, s_type):
    if tlo_schema is None:
        print('src_field_name: {}'.format(src_field_name))
        print(dump_yaml({'src_schema': src_schema}))
        print(dump_yaml({'tlo_schema': tlo_schema}))
        raise Exception(
            'Missing top level object schema for field "{}".'.format(
                src_field_name))

    # Ignore field if it's a generator directive.
    if src_field_name in IGNORE_FIELDS:
        return

    field_type = get_field_type(src_field_name, src_schema)

    # Ignore field if it's not in this schema type's standard fields list.
    if (field_type == 'standard' and 
        src_field_name not in s_type['standard_fields']):
        return

    # Ignore field if it's not meant for this schema type's methods or for
    # this schema type itself.
    if type(src_schema) in DICT_TYPES:
        gd = get_gen_directive(src_schema)
        if 'methods' in gd:
            meant_for_this_method = False
            for m in s_type['methods']:
                if m in gd['methods']:
                    meant_for_this_method = True
                    break
            if not meant_for_this_method:
                return
        if 'noSchemaTypes' in gd:
            for st in gd['noSchemaTypes']:
                if s_type['name'] == st:
                    return

    # Ignore *Count, 'required', and empty array default fields if this schema
    # type doesn't explicitly include them.
    if ((s_type.get('include_count_fields', False) != True)
        and field_type == 'count'):
        return
    if ((s_type.get('include_required_fields', False) != True)
        and src_field_name == 'required'):
        return

    dest_schema = FIELD_HANDLERS[field_type](context, src_field_name,
        src_schema, tlo_schema, url, s_type)
    defn[src_field_name] = dest_schema

def add_or_ignore_all_fields(context, defn,
    src_schema, tlo_schema, url, s_type):
    for src_field_name, nested_src_schema in src_schema.items():
        if nested_src_schema is None:
            nested_src_schema = {}
        nested_tlo_schema = tlo_schema.get(src_field_name, tlo_schema)
        if nested_tlo_schema is None:
            nested_tlo_schema = {}
        add_or_ignore_field(context, defn,
            src_field_name, nested_src_schema, nested_tlo_schema, url, s_type)

def create_default_subcollection_schema(context, subfield_name, src_schema):
    """
    Create a schema of the format:

    description: '{{anArrayContainingThe}} {{plural}} associated with this
    {{parentSingular}}.'
    items:
      description: A {{singular}} associated with this {{parentSingular}}.
      properties:
        id:
        link:
        name:
    """
    tlos = context['tlos']
    tokens = context['tokens']

    if src_schema is None:
        src_schema = CommentedMap(OrderedDict())

    std_fields = find_key_in_tokens('standardFields', tokens)
    dsc_schema = deepcopy(std_fields['defaultSubcollection'])
    if src_schema.get('items', {}).get('type') == 'string':
        del dsc_schema['items']['properties']

    # If this is a non-object subcollection, like a tags array, remove the
    # 'properties' field and just return the schema as is.
    t = src_schema.get('items', {}).get('type')
    no_props = (t is not None and t != 'object')

    # Look up the top level object, honoring tlo overrides.
    tlo_override = get_gen_directive(src_schema).get('topLevelObject')
    if tlo_override is not None:
        tlo_name = tlo_override
    else:
        tlo_name = (TLO_CROSS_REFERENCE['camelCasePluralToCodeSingular']
            [subfield_name])
    tlo = tlos[tlo_name]

    # Add the basic fields to the subcollection items:
    if not no_props:
        dsc_schema['items']['properties'] = get_basic_fields(
            EMPTY_DICT, tlo.get('properties', CommentedMap(OrderedDict())))

    # Merge fields at properties, items, and root levels.
    def merge_fields(dest, src, exclude=[]):
        for k, v in src.items():
            if k not in exclude:
                dest[k] = v
    if not no_props:
        merge_fields(dsc_schema['items']['properties'],
            src_schema.get('items', {}).get('properties', {}))
    merge_fields(dsc_schema['items'],
        src_schema.get('items', {}), ['properties'])
    merge_fields(dsc_schema, src_schema, ['items'])

    return dsc_schema

def get_subcollection_schemas(context, src_schema):
    sc_schemas = CommentedMap(OrderedDict())
    for subfield, subschema in src_schema.items():
        if get_field_type(subfield, subschema) == 'subcollection':
            sc_schemas[subfield] = create_default_subcollection_schema(
                context, subfield, subschema)
    return sc_schemas

def add_warnings_field(defn, tokens):
    defn['warnings'] = deepcopy(find_key_in_tokens('Warnings', tokens))

def gen_collection_def(context, def_name, url):
    """Generate collection definition for GET only, for example 'Bands'."""
    defs = context['defs']
    tokens = context['tokens']

    collection_schema = deepcopy(find_key_in_tokens('Collection', tokens))

    # Push 'url' onto tokens since it's used in link examples.
    tokens.append(CommentedMap(OrderedDict({'url': url})))

    # If we are in a subcollection, inherit the more descriptive description
    # from the parent's containing array.
    if find_key_in_tokens('parentSingular', tokens) is not None:
        collection_schema['description'] = find_key_in_tokens(
            'subcollectionDescription', tokens)

    defn = CommentedMap(OrderedDict())
    code_plural = find_key_in_tokens('codePlural', tokens)
    defs[code_plural] = defn
    add_or_ignore_all_fields(
        context, defn, collection_schema, {}, url, GET_SCHEMA_TYPE)

    # Replace "collectionItems"/"collectionItemsCount" with actual items name.
    defn_props = defn['properties']
    # Don't want to just use code_plural for the array label in the collection.
    # We want for example just 'people' rather than 'bandPeople'.
    camel_case_plural = decapitalize(
        combine_words(find_key_in_tokens('plural', tokens)))
    comment_map_replace(
        defn_props,
        'collectionItems',
        defn_props['collectionItems'],
        camel_case_plural)
    comment_map_replace(
        defn_props,
        'collectionItemsCount',
        defn_props['collectionItemsCount'],
        '{}{}'.format(camel_case_plural, 'Count'))

    # Add conditional warnings list.
    add_warnings_field(defn_props, tokens);

    # Pop 'url' off tokens.
    tokens.pop()

def gen_item_def(context, def_name, src_schema, tlo_schema, url, s_type):
    defs = context['defs']
    tokens = context['tokens']

    src_schema = deepcopy(src_schema)

    # Create and push new layer of tokens for this schema type.
    new_tokens = prepare_new_tokens(
        tokens, src_schema, tlo_schema, s_type, new_parents=False)
    tokens.append(new_tokens)

    # Override the top level item description for this schema type.
    # Example:
    #  GET: 'A band and its related band info.'
    # POST: 'A new band to create.'
    if ('description' in src_schema and 'description' in s_type):
        d = find_key_in_tokens(s_type['description'], tokens)
        if d is None:
            d = src_schema['description']
        src_schema['description'] = d

    defn = CommentedMap(OrderedDict())
    item_name = find_key_in_tokens('codeSingular', tokens)
    schema_name = '{}{}'.format(item_name, s_type['suffix'])
    defs[schema_name] = defn
    add_or_ignore_all_fields(context, defn, src_schema, tlo_schema, url, s_type)

    # Add warnings field if this is a collection item schema type or create an
    # additional version of this item definition with warnings if this is a
    # definition that can appear in both collection and collection item paths.
    if 'properties' in defn:
        if s_type['include_warnings']:
            add_warnings_field(defn['properties'], tokens);
        elif s_type['add_warnings_version']:
            schema_with_warnings_name = '{}{}'.format(
                schema_name, 'WithWarnings')
            defn_with_warnings = CommentedMap(OrderedDict(deepcopy(defn)))
            defs[schema_with_warnings_name] = defn_with_warnings
            add_warnings_field(defn_with_warnings['properties'], tokens);

    # Pop tokens for this schema type.
    tokens.pop()

"""
Path Generation
"""

def get_path_param(context, camel_case_singular):
    params = context['params']
    param_key = '{}Param'.format(camel_case_singular)

    # Add this path parameter to the parameters list if it doesn't exist yet.
    if param_key not in params:
        tokens = context['tokens']
        param_name = '-'.join(separate_words(camel_case_singular).split(' '))
        tokens.append(CommentedMap(OrderedDict({'paramName': param_name})))
        p = deepcopy(find_key_in_tokens('Parameter', tokens),
            CommentedMap(OrderedDict()))
        replace_tokens_in_c_map(p, tokens, [], final_pass=True)
        params[param_key] = p
        tokens.pop()

    return param_key

def get_param_nodes(path):
    """Given '/bands/{band}/people/{person}', return ['band', 'person']."""
    path_nodes = path.split('/')
    param_nodes = []
    for pn in path_nodes:
        if pn.startswith('{') and pn.endswith('}'):
            param_nodes.append(pn[1:-1])
    return param_nodes

def get_path_params(context, path):
    path_nodes = path.split('/')
    path_params = []
    for pn in get_param_nodes(path):
        pnCamelCase = decapitalize(combine_words(pn.replace('-', ' ')))
        param_key = get_path_param(context, pnCamelCase)
        path_params.append('#/parameters/{}'.format(param_key))
    return path_params

def add_tag_and_params_to_schema_methods(context, path, schema):
    tokens = context['tokens']
    path_params = get_path_params(context, path)
    tag = find_key_in_tokens('tag', tokens)
    for method_name, method_schema in schema.items():
        method_schema['tags'] = [tag]
        params = method_schema.get('parameters', CommentedSeq())
        if type(params) not in LIST_TYPES:
            params = CommentedSeq()
        for i in range(len(path_params)):
            params.insert(
                i, CommentedMap(OrderedDict({'$ref': path_params[i]})))
        method_schema['parameters'] = params

def cull_disallowed_methods(dest_schema, src_schema):
    """If this URL only accepts GETs, elide the rest of the methods."""
    methods = get_gen_directive(src_schema).get('methods', None)
    if methods is not None:
        for m in ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']:
            if m not in methods:
                del dest_schema[m.lower()]

def gen_collection_path(context, def_name, path, src_schema, tlo_schema):
    paths = context['paths']
    tokens = context['tokens']

    # Use either the top level object collection descriptions, or subcollection
    # descriptions, depending on if we have a parent object (and are therefore
    # in a subcollection).
    if find_key_in_tokens('parentSingular', tokens) is None:
        collection_schema_name = 'CollectionPath'
    else:
        collection_schema_name = 'SubCollectionPath'
    collection_path = deepcopy(
        find_key_in_tokens(collection_schema_name, tokens))
    paths[path] = collection_path

    # Push new tokens for this schema.
    new_tokens = prepare_new_tokens(
        tokens, src_schema, tlo_schema, GET_SCHEMA_TYPE, new_parents=False)
    tokens.append(new_tokens)

    # Add appropriate tag and url parameters to the methods.
    add_tag_and_params_to_schema_methods(context, path, collection_path)

    # If this URL only accepts GETs, elide the rest of the methods.
    cull_disallowed_methods(collection_path, src_schema)

    # Replace all tokens in strings.
    replace_tokens_in_c_map(collection_path, tokens, [], final_pass=True)

    # Pop tokens for this schema.
    tokens.pop()

def gen_item_path(context, def_name, path, src_schema, tlo_schema):
    paths = context['paths']
    tokens = context['tokens']

    # Use either the top level object collection descriptions, or subcollection
    # descriptions, depending on if we have a parent object (and are therefore
    # in a subcollection).
    item_path = deepcopy(find_key_in_tokens('ItemPath', tokens))
    if find_key_in_tokens('parentSingular', tokens) is not None:
        item_path_addendum = deepcopy(
            find_key_in_tokens('SubcollectionItemPath', tokens))
        item_path.update(item_path_addendum)
    paths[path] = item_path

    # Push new tokens for this schema.
    new_tokens = prepare_new_tokens(
        tokens, src_schema, tlo_schema, GET_SCHEMA_TYPE, new_parents=False)
    tokens.append(new_tokens)

    # Add appropriate tag and url parameters to the methods.
    add_tag_and_params_to_schema_methods(context, path, item_path)

    # If this URL only accepts GETs, elide the rest of the methods.
    cull_disallowed_methods(item_path, src_schema)

    # Replace all tokens in strings.
    replace_tokens_in_c_map(item_path, tokens, [], final_pass=True)

    # Pop tokens for this schema.
    tokens.pop()

"""
Generation Outer Loop
"""

def parse_collection_contents(array_schema):
    """
    Get 'band members or other people associated with this band' from
    '{{anArrayContainingThe}} band members or other people associated with
    this band.'
    """
    if type(array_schema) not in DICT_TYPES:
        array_schema = CommentedMap(OrderedDict())
    description = array_schema.get('description', '')
    description = re.sub('{{.+?}}', '', description, count=1).strip()
    if description.endswith('.'):
        description = description[:-1]
    return description

def gen_defs_and_paths(context, path, def_name, src_schema, tlo_schema):
    tokens = context['tokens']
    tlos = context['tlos']

    print('Generating: {}'.format(path))

    url = replace_url_nodes_with_examples(
        '{}{}'.format(LINK_EXAMPLE_BASE, path))
    itm_url = get_item_url(tlo_schema)
    gen_collection_def(context, def_name, url)

    # Determine which schemas we need to prepare.
    if find_key_in_tokens('parentSingular', tokens) is None:
        sts = SCHEMA_TYPES
    else:
        sts = SUBCOLLECTION_SCHEMA_TYPES
    methods = get_gen_directive(src_schema).get('methods', None)
    if methods is not None:
        sts = get_filtered_schema_types(methods, sts)

    for st in sts:
        s_type = deepcopy(SCHEMA_TYPE_DEFAULTS)
        s_type.update(st)
        s_type = do_schema_type_modifications(src_schema, s_type)
        gen_item_def(context, def_name, src_schema, tlo_schema, itm_url, s_type)

    gen_collection_path(context, def_name, path, src_schema, tlo_schema)
    item_node = find_key_in_tokens('urlSingular', tokens)
    # Make sure the item name in the url is unique.
    if item_node in get_param_nodes(path):
        item_node = 'sub-{}'.format(item_node)
    item_path = '{}/{}{}{}'.format(path, '{', item_node, '}')
    gen_item_path(context, def_name, item_path, src_schema, tlo_schema)

    # Generate subcollection definitions and paths.
    subcollection_schemas = get_subcollection_schemas(
        context, src_schema.get('properties', CommentedMap(OrderedDict())))
    for sc_name, sc_schema_array in subcollection_schemas.items():
        if sc_name not in TLO_CROSS_REFERENCE['camelCasePluralToCodeSingular']:
            continue
        sc_code_singular = (
            TLO_CROSS_REFERENCE['camelCasePluralToCodeSingular'][sc_name])

        # Assemble subcollection-specific tokens from the TLO names, assigning
        # new compound names like "BandPeople", "BandPerson", ...
        sc_tlo_schema = deepcopy(tlos[sc_code_singular])
        tlo_tokens = get_tokens(sc_tlo_schema)
        prefix = separate_words(find_key_in_tokens('codeSingular', tokens))
        suffix_singular = find_key_in_tokens('singular', [tlo_tokens])
        suffix_plural = find_key_in_tokens('plural', [tlo_tokens])
        sc_code_singular = combine_words(
            '{} {}'.format(prefix, suffix_singular))
        sc_code_plural = combine_words('{} {}'.format(prefix, suffix_plural))
        sc_tlo_schema['__gen__']['tokens'] = (CommentedMap(OrderedDict({
            'singular': suffix_singular,
            'plural': suffix_plural,
            'codeSingular': sc_code_singular,
            'codePlural': sc_code_plural,
            'collectionContents': parse_collection_contents(sc_schema_array)
        })))
        # Fill in the rest of the names.
        fill_out_name_tokens(sc_code_singular,
            sc_tlo_schema['__gen__']['tokens'])

        # Push new tokens for this subcollection.
        sc_schema_items = sc_schema_array.get(
            'items', CommentedMap(OrderedDict()))
        new_tokens = prepare_new_tokens(
            tokens, sc_schema_array, sc_tlo_schema, GET_SCHEMA_TYPE)
        tokens.append(new_tokens)

        # Pass on method restrictions from the parent subcollection.
        pmethods = get_gen_directive(src_schema).get(
            'methods', CommentedMap(OrderedDict()))
        submethods = get_gen_directive(sc_schema_array).get(
            'methods', CommentedMap(OrderedDict()))
        if len(pmethods) > 0:
            # If a parent didn't allow modification, a subcollection shouldn't
            # even allow deletes.
            mod_methods = ['POST', 'PATCH', 'PUT']
            isParentModifiable = (True in [m in pmethods for m in mod_methods])
            if not isParentModifiable:
                submethods = ['GET']
            else:
                if len(submethods) == 0:
                    submethods.update(pmethods)
                else:
                    submethods = CommentedMap(OrderedDict(
                        [sm for sm in submethods if sm in pmethods]))

        # Pass on method restrictions from the array schema to the items schema.
        if len(submethods) > 0:
            sgd = get_gen_directive(sc_schema_items)
            sgd['methods'] = submethods

        sc_path = '{}/{}'.format(
            item_path, find_key_in_tokens('urlPlural', tokens))
        sc_full_name = find_key_in_tokens('codeSingular', tokens)

        gen_defs_and_paths(
            context, sc_path, sc_full_name, sc_schema_items, sc_tlo_schema)

        # Pop this subcollection's tokens.
        tokens.pop()

def merge_paths_defs_and_params(
    template, generated_paths, generated_defs, generated_params):
    """
    Insert generated paths, definitions, and parameters into the output
    template at the appropriate hooks.
    """
    out_yaml = CommentedMap(OrderedDict())

    for key, val in template.items():
        if key == 'paths':
            template_paths = val
            out_paths = CommentedMap(OrderedDict())
            for pkey, pval in template_paths.items():
                if pkey in generated_paths:
                    # Insert all generated paths under this template path hook.
                    for gpkey, gpval in generated_paths[pkey].items():
                        out_paths[gpkey] = gpval
                elif pval is not None:
                    out_paths[pkey] = pval
            out_yaml['paths'] = out_paths
            start_comment = 'Index:\n{}'.format(
                ''.join(['{}\n'.format(k) for k in out_paths.keys()]))
            out_yaml['paths'].yaml_set_start_comment(start_comment, indent=2)
        elif key == 'parameters':
            # Preserve all the existing parameters in the output template,
            # except replace 'pathParams' with the generated ones.
            template_params = val
            out_params = CommentedMap(OrderedDict())
            for tkey, tval in template_params.items():
                if tkey == 'pathParams':
                    for prmkey, prmval in generated_params.items():
                        out_params[prmkey] = prmval
                else:
                    out_params[tkey] = tval
            out_yaml['parameters'] = out_params
        elif key == 'definitions':
            template_defs = val
            out_defs = CommentedMap(OrderedDict())
            for dkey, dval in template_defs.items():
                if dkey in generated_defs:
                    # Insert all generated defs under this template def hook.
                    for gdkey, gdval in generated_defs[dkey].items():
                        out_defs[gdkey] = gdval
                elif dval is not None:
                    out_defs[dkey] = dval
            out_yaml['definitions'] = out_defs
        else:
            out_yaml[key] = val

    return out_yaml

"""
Main Script
"""

def main():

    # Load base definitions from definitions file.
    # print("Loading tokens and definitions from '{}'.".format(DEFINITIONS_FILE))
    with open(DEFINITIONS_FILE, 'r') as f:
        in_yaml = load_yaml(f)
    tokens = [in_yaml]
    tlos = in_yaml['topLevelObjects']
    tl_paths = in_yaml['topLevelPaths']

    params = in_yaml['params']
    defs = CommentedMap(OrderedDict())
    paths = CommentedMap(OrderedDict())

    name_top_level_objects(tlos)
    with open('temp', 'w') as f:
        ordered_tlo_keys = ([
            'Band', 'Connection', 'Person', 'Role', 'City', 'State',
            'Country', 'Region', 'Edit', 'Editor', 'Revision', 'Annotation',
            'InfoSource', 'User', 'Session'
        ])
        temp_out = CommentedMap(OrderedDict())
        for k in ordered_tlo_keys:
            temp_out[k] = tlos[k]['__gen__']['tokens']
        f.write(dump_yaml(temp_out))

    for tl_path in tl_paths:
        cc_plural = decapitalize(
            combine_words(' '.join((tl_path.split('/')[-1]).split('-'))))
        def_name = TLO_CROSS_REFERENCE['camelCasePluralToCodeSingular'].get(
            cc_plural)
        if def_name is not None:
            # Initialize generation context.
            src_schema = tlos[def_name]
            tlo_schema = src_schema
            tokens.append(get_tokens(tlo_schema))
            code_plural = find_key_in_tokens('codePlural', tokens)
            defs[code_plural] = CommentedMap(OrderedDict())
            paths[tl_path] = CommentedMap(OrderedDict())
            context = {
                'tlos': tlos,
                'defs': defs[code_plural],
                'paths': paths[tl_path],
                'params': params,
                'tokens': tokens
            }
            gen_defs_and_paths(
                context, tl_path, def_name, src_schema, tlo_schema)
            tokens.pop()

    out_yaml = merge_paths_defs_and_params(
        in_yaml['Output'], paths, defs, params)

    with open(OUTPUT_FILE, 'w') as f:
        f.write(dump_yaml(out_yaml))

if __name__ == '__main__':
    main()

"""
TODO:

Privileges:
  [read|write]-band-info: The publicly/anonymously accessible/editable general band map data.
  [read|write]-edit-info: The edit history and session metadata, publicly readable, limited write access only for admins.
  [read|write]-own-account-info: Read account data for the current authenticated user, write limited account fields.
  [read|write]-admin-info: Read/write account data about anyone.

Rate Limit Profiles (not sure these factor into swagger config anywhere):
                    Total Calls/Min    Row Edits/Min
Anonymous User      100                10
Registered User     1000               100
Bot/Admin           no limit?          no limit?

More Headers and Header Parameters

URL Templates (Priv Profile, Method Set, Query Arg Set):
- collection
- collectionItem
- tagCollection
- tag
- resourceGroupListing (directory of sub-resources)
- special (like /version)
- error

Generate/permute API versions into different output directories.
"""
