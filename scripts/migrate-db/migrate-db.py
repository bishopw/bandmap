#!/usr/bin/python3
"""
Migrate data from band map 1.0 db to 2.0 db:
  - bands
  - people
  - connections
  - cities
  - states
  - countries
  - websites

To use:
sudo pip3 install pymysql
sudo pip3 install psycopg2
sudo pip3 install ruamel.yaml
fill in in_db and out_db parameters below
./migrate-db.py

"""

"""
Arguments
"""

in_db = {
    'database': 'bandmap',
    'host': 'localhost',
    'port': 3306,
    'user': 'root',
    'password': ''
}

out_db_create_script = 'bandmap2.0.pg.sql'

out_db = {
    'database': 'bandmap',
    'host': 'localhost',
    'port': 5432,
    'user': 'postgres',
    'password': 'a'
}

verbose = False
very_verbose = False

DATA_FORMATS_FILE = 'data_formats.yaml'

"""
Imports
"""

import sys
from copy import deepcopy
from collections import OrderedDict
import re
from pymysql import connect as mysql_connect
from psycopg2 import connect as pg_connect
import ruamel.yaml as yaml
import argparse

"""
Utilities
"""

CommentedMap = yaml.comments.CommentedMap
CommentedSeq = yaml.comments.CommentedSeq

YAML_LINE_WIDTH = 1000000

RoundTripDumperNoAliases = yaml.RoundTripDumper
RoundTripDumperNoAliases.ignore_aliases = lambda self, data: True
def dump_yaml(object, indent=0):
    """
    Dump an object to a YAML string with appropriate settings.
    """
    return yaml.dump(
        object,
        width=YAML_LINE_WIDTH,
        Dumper=RoundTripDumperNoAliases,
        indent=indent)

def load_yaml(stream_or_string):
    """
    Load a YAML stream or string into a
    CommentedMap object with appropriate settings.
    """
    return yaml.load(stream_or_string, yaml.RoundTripLoader)

# Adapted from
# stackoverflow.com/questions/4408714/execute-sql-file-with-python-mysqldb:
def exec_sql_file(cursor, sql_file):
    if verbose:
        print('  Running SQL script: {}'.format(sql_file))

    in_multiline_comment = False
    smt_count = 0
    err_count = 0
    statement = ''

    for line in open(sql_file):

        # remove endline or full line comments
        comment_index = line.find('--')
        if comment_index != -1:
            line = line[:comment_index].strip()
            if len(line) == 0:
                continue

        if re.match(r'\/\*', line): # keep eating multiline comments
            in_multiline_comment = True
            continue

        if re.match(r'\*\/', line):
            in_multiline_comment = False
            continue

        if in_multiline_comment:
            continue

        if not re.search(r'[^-;]+;', line):
            # keep appending lines that don't end in ';'
            statement = '{} {}'.format(statement, line)

        else:
            # when you get a line ending in ';' then exec statement
            # and reset for next statement
            statement = ('{} {}'.format(statement, line).
                replace('\n', ' ').strip())
            smt_short = (statement if len(statement) < 53
                else '{}...'.format(statement[:50]))
            if very_verbose:
                print('    Executing SQL: {}'.format(smt_short))
            try:
                smt_count += 1
                cursor.execute(statement)
            except Exception as e:
                err_count += 1
                print('      Error: {}'.format(str(e.args)))

            statement = ''

    if verbose:
        print('    Executed {} statements.  {} error(s).'.format(
            smt_count, err_count))

def clean_ends(word, ignore=[]):
    bad_chars = [',', '.', '-', '_', ' ', '\t', '\n', '\r', '\\', '/']
    while word[-1] in bad_chars and word[-1] not in ignore:
        word = word[0:-1]
    while word[0] in bad_chars and word[0] not in ignore:
        word = word[1:]
    return word

"""
Data Model

These classes correspond to the main object output tables in the 2.0 database.
Their job is to take records from the 4 input tables and convert them to the
output format, noting any normalizations and adjustments to a MigrationNotes
object along the way.
"""
"""
    Sort ingested records into the new data model.
      Normalize band and person names.
      Deduplicate bands and people.
      Normalize pending connection descriptions.
      Try to extract band and people annotations and connection descriptions
        from the pending connection descriptions.
      Describe unexplained connections where possible (if shared members found).
      Infer band members from connection descriptions.
      Deduplicate cities and states.
      Infer cities' states and countries.
"""
class Band:
    @staticmethod
    def normalize_name(name):
        name = name.strip()
        return name

    def __init__(self, id_1_0, name, click_count):
        self.id_2_0 = None
        self.id_1_0 = id_1_0
        self.name = Band.normalize_name(name)
        self.connection_count = 0
        self.click_count = click_count
        self.people = []
        self.cities = []

class Bands:
    def __init__(self):
        self.data = OrderedDict()
        self.by_id_1_0 = {}
        self.by_id_2_0 = {}

    def __iter__(self):
        return iter(self.data.values())

    def __contains__(self, key):
        return key.lower() in self.data

    def __getitem__(self, key):
        return self.data[key.lower()]

    def __setitem__(self, key, value):
        self.data[key.lower()] = value
        if value.id_1_0 is not None:
            self.by_id_1_0[value.id_1_0] = value

class Person:
    @staticmethod
    def normalize_name(name):
        name = name.strip()
        return name

    def __init__(self, name):
        self.id_2_0 = None
        self.name = Person.normalize_name(name)
        self.bands = []

class People:
    def __init__(self):
        self.data = OrderedDict()
        self.by_id_2_0 = {}

    def __iter__(self):
        return iter(self.data.values())

    def __contains__(self, key):
        return key.lower() in self.data

    def __getitem__(self, key):
        return self.data[key.lower()]

    def __setitem__(self, key, value):
        self.data[key.lower()] = value

class Connection:
    def __init__(self, band1, band2):
        self.band1 = band1
        self.band2 = band2

class Connections:
    def __init__(self):
        self.data = []

    def __iter__(self):
        return iter(self.data)

    def __len__(self):
        return len(self.data)

    def __contains__(self, key):
        band1, band2 = key
        return key in self.data or (band2, band1) in self.data

    def __getitem__(self, key):
        if key in self.data:
            return key
        band1, band2 = key
        if (band2, band1) in self.data:
            return (band2, band1)
        raise KeyError(key)

    def append(self, key):
        band1, band2 = key

        # Order connections by (band with more connections, band with less)
        canonical_key = (band1, band2)
        if band1.connection_count == band2.connection_count:
            if band1.name.lower() < band2.name.lower():
                canonical_key = (band1, band2)
            else:
                canonical_key = (band2, band1)
        elif band1.connection_count > band2.connection_count:
            canonical_key = (band1, band2)
        else: # band2.connection_count > band1.connection_count:
            canonical_key = (band2, band1)

        noncanonical_key = (canonical_key[1], canonical_key[0])

        # Replace noncanonical key with canonical one if necessary.
        if noncanonical_key in self.data:
            self.data.remove(noncanonical_key)

        if canonical_key not in self.data:
            self.data.append(canonical_key)

    def sort(self):
        # Re-add all connections so they are in canonical order.
        old = deepcopy(self.data)
        self.data = []
        for (band1, band2) in old:
            self.append((band1, band2))

        # Sort by most to least connected.
        sorted_connections = []
        by_connection_count = {}
        for (band1, band2) in self.data:
            c_count = band1.connection_count
            if c_count not in by_connection_count:
                by_connection_count[c_count] = {}
            entry = by_connection_count[c_count]
            if band1.name not in entry:
                entry[band1.name] = []
            sub_entry = entry[band1.name]
            sub_entry.append((band1, band2))
        for c_count in sorted(by_connection_count.keys(), reverse=True):
            entry = by_connection_count[c_count]
            for band1name in sorted(entry.keys()):
                band1_connections = []
                for (band1, band2) in entry[band1name]:
                    band1_connections.append((band1, band2))
                sorted_connections += (sorted(band1_connections,
                    key=lambda c: c[1].connection_count, reverse=True))

        self.data = sorted_connections

class NameMatrixMap:
    """
    For identifying and looking up cities and states by their containing
    state/country respectively, since different cities and states can have
    the same name.
    """
    def __init__(self):
        self.data = OrderedDict()

    def __iter__(self):
        for entry in self.data.values():
            for val in entry.values():
                yield val

    def __contains__(self, key_name_parent_name_tuple):
        name, parent_name = key_name_parent_name_tuple
        entry = self.data.get(name, {})
        return parent_name in entry

    def __getitem__(self, key_name_parent_name_tuple):
        name, parent_name = key_name_parent_name_tuple
        entry = self.data.get(name, {})
        val = entry.get(parent_name, None)
        return val

    def __setitem__(self, key_name_parent_name_tuple, val):
        name, parent_name = key_name_parent_name_tuple
        if name not in self.data:
            self.data[name] = OrderedDict()
        entry = self.data[name]
        entry[parent_name] = val

    def __delitem__(self, key_name_parent_name_tuple):
        name, parent_name = key_name_parent_name_tuple
        entry = self.data.get(name, {})
        if parent_name in entry:
            del entry[parent_name]
            if len(entry) == 0:
                del self.data[name]

    def get_all(self, key_name):
        return self.data.get(key_name, {})


class City:
    @staticmethod
    def normalize_name(name):
        name = clean_ends(name, ignore=['.'])
        words = name.split(' ')
        words = ['-'.join([part.capitalize() for part in word.split('-')])
            for word in words]
        words = ['.'.join([part.capitalize() for part in word.split('.')])
            for word in words]
        name = ' '.join(words)
        return name

    def __init__(self, name, state):
        self.id_2_0 = None
        self.name = City.normalize_name(name)
        self.state = state
        self.bands = []

    def fullname(self):
        if self.state is not None:
            if self.state.country is not None:
                return '{}, {}, {}'.format(
                    self.name, self.state.name, self.state.country.name)
            return '{}, {}'.format(self.name, self.state.name)
        return self.name

class Cities:
    def __init__(self):
        self.data = NameMatrixMap()
        self.by_id_2_0 = {}

    def __iter__(self):
        return iter(self.data)

    def __contains__(self, city_name_state_name_tuple):
        return city_name_state_name_tuple in self.data

    def __getitem__(self, city_name_state_name_tuple):
        return self.data[city_name_state_name_tuple]

    def __setitem__(self, city_name_state_name_tuple, city):
        self.data[city_name_state_name_tuple] = city

    def __delitem__(self, city_name_state_name_tuple):
        del self.data[city_name_state_name_tuple]

    def get_all(self, city_name):
        return self.data.get_all(city_name)

    def filter(self, other_cities):
        filtered = []
        for oc in other_cities:
            if (oc.name, oc.state.name) in self.data:
                filtered.append(oc)
        return filtered

class State:
    @staticmethod
    def normalize_name(name):
        name = clean_ends(name)
        name = ' '.join([w.capitalize() for w in name.split(' ')])
        if len(name) == 2:
            # Assume state abbreviation for two-letter states.
            name = name.upper()
        return name

    def __init__(self, name, country):
        self.id_2_0 = None
        self.name = State.normalize_name(name)
        self.cities = []
        self.country = country

    def fullname(self):
        if self.country is not None:
            return '{}, {}'.format(
                self.name, self.country.name)
        return self.name

class States:
    def __init__(self):
        self.data = NameMatrixMap()
        self.by_id_2_0 = {}

    def __iter__(self):
        return iter(self.data)

    def __contains__(self, state_name_country_name_tuple):
        return state_name_country_name_tuple in self.data

    def __getitem__(self, state_name_country_name_tuple):
        return self.data[state_name_country_name_tuple]

    def __setitem__(self, state_name_country_name_tuple, state):
        self.data[state_name_country_name_tuple] = state

    def __delitem__(self, state_name_country_name_tuple):
        del self.data[state_name_country_name_tuple]

    def get_all(self, state_name):
        return self.data.get_all(state_name)

    def filter(self, other_states):
        filtered = []
        for os in other_states:
            if (os.name, os.country.name) in self.data:
                filtered.append(os)
        return filtered

class Country:
    @staticmethod
    def normalize_name(name):
        name = clean_ends(name)
        return name

    def __init__(self, name):
        self.id_2_0 = None
        self.name = Country.normalize_name(name)
        self.states = []

class Countries:
    def __init__(self):
        self.data = OrderedDict()
        self.by_id_2_0 = {}

    def __iter__(self):
        return iter(self.data.values())

    def __contains__(self, key):
        return key.lower() in self.data

    def __getitem__(self, key):
        return self.data[key.lower()]

    def __setitem__(self, key, value):
        self.data[key.lower()] = value

    def filter(self, other_countries):
        filtered = []
        for oc in other_countries:
            if oc.name in self:
                filtered.append(oc)
        return filtered

class Website:
    @staticmethod
    def normalize_url(url):
        url = url.strip()
        return url

    def __init__(self, url, band):
        self.id_2_0 = None
        self.url = Website.normalize_url(url)
        self.bands = []
        self.bands.append(band)

class Websites:
    def __init__(self):
        self.data = OrderedDict()
        self.by_id_2_0 = {}

    def __iter__(self):
        return iter(self.data.values())

    def __contains__(self, key):
        return key.lower() in self.data

    def __getitem__(self, key):
        return self.data[key.lower()]

    def __setitem__(self, key, value):
        self.data[key.lower()] = value

class Annotation:
    def __init__(self):
        pass

class Annotations:
    def __init__(self):
        pass

class LocationsTable:
    """
    Instantiates a collection of reference locations based on info from
    the internet.
    """
    def __init__(self, data_model):

        # Instantiate reference countries, states, and cities,
        # and build aliases lookup table.
        countries = self.countries = Countries()
        states = self.states = States()
        state_aliases = self.state_aliases = NameMatrixMap()
        cities = self.cities = Cities()
        city_aliases = self.city_aliases = NameMatrixMap()

        countries_table = DataModel.formats()['countries_table']

        for country_name, state_list in countries_table.items():
            country = Country(country_name)
            countries[country_name] = country
            for state_name, city_list in state_list.items():
                state = State(state_name, country)
                states[state_name, country_name] = state
                country.states.append(state)
                state_aliases[
                    state_name.strip().lower(),
                    country_name.strip().lower()] = state
                if city_list is not None:
                    for city_name, aliases in city_list.items():
                        city = City(city_name, state)
                        cities[city_name, state_name] = city
                        state.cities.append(city)
                        city_aliases[city_name, state_name] = city
                        city_aliases[
                            city_name.strip().lower(),
                            state_name.strip().lower()] = city
                        if aliases is not None:
                            for alias in aliases:
                                city_aliases[alias, state_name] = city
                                city_aliases[
                                    alias.strip().lower(),
                                    state_name.strip().lower()] = city

    def get_best_city_match(self, city_name, state_name):
        city_name = city_name.strip().lower()
        state_name = state_name.strip().lower()
        if (city_name, state_name) in self.city_aliases:
            return self.city_aliases[city_name, state_name]
        if state_name != '':
            # An unrecognized city/state pair.
            return None
        # A city name with unknown state.
        cities = self.city_aliases.get_all(city_name)
        if len(cities) > 0:
            # Take the first city, or the one with the most bands.
            highest_band_count = 0
            highest_band_count_city = None
            for c in cities.values():
                if highest_band_count_city == None:
                    highest_band_count_city = c
                if len(c.bands) > highest_band_count:
                    highest_band_count = len(c.bands)
                    highest_band_count_city = c
            return highest_band_count_city
        return None

    def get_best_state_match(self, state_name):
        # A state name with unknown country.
        state_name = state_name.strip().lower()
        states = self.state_aliases.get_all(state_name)
        if len(states) > 0:
            # Take the first state, or the one with the most cities.
            highest_city_count = 0
            highest_city_count_state = None
            for s in states.values():
                if highest_city_count_state == None:
                    highest_city_count_state = s
                if len(s.cities) > highest_city_count:
                    highest_city_count = len(s.cities)
                    highest_city_count_state = s
            return highest_city_count_state
        return None

class MigrationResults:
    """Tracks and outputs the many migration results for the output report."""
    def __init__(self, data_model):
        self.data_model = data_model
        self.data = deepcopy(DataModel.formats()['migration_results'])

    def __getitem__(self, key):
        return self.data[key]

    def __setitem__(self, key, value):
        self.data[key] = value

    @staticmethod
    def sort_by_value(d):
        sorted_d = CommentedMap(OrderedDict())
        ordered_values = sorted(d.values(), reverse=True)
        d_order = []
        for v in ordered_values:
            if v not in d_order:
                d_order.append(v)
        for v in d_order:
            for k, vv in d.items():
                if vv == v:
                    sorted_d[k] = vv
        return sorted_d

    def refresh(self):
        r = self.data

        bands = self.data_model.bands
        member_count = []
        member_count_members_only = []
        for b in bands:
            member_count.append(len(b.people))
            if len(b.people) == 0:
                r['Bands']['No Members Count'] += 1
                r['Bands']['No Members'].append(b.name)
            else:
                member_count_members_only.append(len(b.people))
            if len(b.cities) == 0:
                r['Bands']['No City Count'] += 1
                r['Bands']['No City'].append(b.name)
            if len(b.cities) > 1:
                r['Bands']['Multiple Cities Count'] += 1
                r['Bands']['Multiple Cities'][b.name] = [
                    c.fullname() for c in b.cities]
        r['Bands']['Average Members Per Band'] = float(
            '{:.2f}'.format(sum(member_count) / len(member_count)))
        r['Bands']['Only Counting Bands With Members'] = float(
            '{:.2f}'.format(sum(member_count_members_only) /
                len(member_count_members_only)))
        r['Bands']['No Members'] = sorted(r['Bands']['No Members'])

        people = self.data_model.people
        bands_per_person = []
        people_count_by_band_count = {0: 0}
        pimb = r['People']['In Multiple Bands']
        for p in people:
            band_count = len(p.bands)
            bands_per_person.append(band_count)
            if band_count in people_count_by_band_count:
                people_count_by_band_count[band_count] += 1
            else:
                people_count_by_band_count[band_count] = 1
            if band_count > 1:
                r['People']['In Multiple Bands Count'] += 1
                pimb[p.name] = band_count
        r['People']['In Multiple Bands'] = MigrationResults.sort_by_value(pimb)
        hmbapi = r['People']['How Many Bands Are People In']
        people_count_by_band_count = (
            MigrationResults.sort_by_value(people_count_by_band_count))
        for k in sorted(people_count_by_band_count.keys()):
            hmbapi['{} Bands'.format(k)] = '{} People'.format(
                people_count_by_band_count[k])
        r['People']['Average Bands Per Person'] = float(
            '{:.2f}'.format(sum(bands_per_person) / len(bands_per_person)))

        cities = self.data_model.cities
        city_band_count = {}
        multiple_states = CommentedMap(OrderedDict())
        for c in cities:
            if c == None:
                continue
            r['Cities']['Band Count'][c.fullname()] = len(c.bands)
            if c.state == None:
                r['Cities']['No State Count'] += 1
                r['Cities']['No State'].append(c.fullname())
            cities_with_this_name = cities.get_all(c.name)
            if len(cities_with_this_name) > 1:
                if c.name in multiple_states:
                    multiple_states[c.name].append(c.fullname())
                else:
                    multiple_states[c.name] = [c.fullname()]
        r['Cities']['Multiple States/Countries Count'] = len(multiple_states)
        r['Cities']['Multiple States/Countries'] = multiple_states
        r['Cities']['Band Count'] = MigrationResults.sort_by_value(
            r['Cities']['Band Count'])

        wwmb = r['Websites']['Websites With Multiple Bands']
        r['Websites']['Websites With Multiple Bands Count'] = len(wwmb)
        wwmbkeys = deepcopy([k for k in wwmb.keys()])
        new_wwmb = CommentedMap(OrderedDict())
        for wk in wwmbkeys:
            bcount = len(wwmb[wk])
            new_wwmb['{} ({} Bands)'.format(wk, bcount)] = wwmb[wk]
        r['Websites']['Websites With Multiple Bands'] = new_wwmb

        def append_times_for_clarity(parent_dict, dict_key):
            d = parent_dict[dict_key]
            new_d = CommentedMap(OrderedDict())
            for k, v in d.items():
                new_d[k] = '{} Times'.format(v)
            parent_dict[dict_key] = new_d

        append_times_for_clarity(
            r['Cities'], 'Assigned A State/Country Through Lookup Table')
        niltwbr = "Not In Lookup Table (Won't Be Written)"
        append_times_for_clarity(r['Cities'], niltwbr)
        append_times_for_clarity(r['States'], niltwbr)

        def consolidate_entries(parent_dict, list_key):
            l = parent_dict[list_key]
            new_dict = CommentedMap(OrderedDict())
            for i in l:
                if i in new_dict:
                    new_dict[i] += 1
                else:
                    new_dict[i] = 1
            parent_dict[list_key] = new_dict
            append_times_for_clarity(parent_dict, list_key)

        consolidate_entries(r['States'], "Normalized (like 'Wa' => 'WA')")
        consolidate_entries(r['Cities'], 'Normalized')

        for s in self.data_model.states:
            if s == None:
                continue
            if s.country == None:
                r['States']['No Country Count'] += 1
                r['States']['No Country'].append(s.fullname())

    @staticmethod
    def filter(d, max=5, depth=0):
        map_types = [type(CommentedMap()), type(OrderedDict()), type({})]
        list_types = [type(CommentedSeq()), type([])]
        limit_at_depth = 2
        i = 0
        if type(d) in map_types:
            imax = ((max - 1) if len(d) > max else max) # Room for ellipses...
            f = CommentedMap(OrderedDict())
            for k, v in d.items():
                f[k] = MigrationResults.filter(v, max=max, depth=depth+1)
                i += 1
                if i > imax and depth >= limit_at_depth:
                    break
            if len(d) > max and depth >= limit_at_depth:
                f['...'] = '...'
        elif type(d) in list_types:
            imax = ((max - 1) if len(d) > max else max) # Room for ellipses...
            f = []
            for v in d:
                f.append(v)
                i += 1
                if i >= imax and depth >= limit_at_depth:
                    break
            if len(d) > max and depth >= limit_at_depth:
                f.append('...')
        else:
            f = d

        return f

    def get_filtered(self):
        self.refresh()
        if very_verbose:
            return self.data
        return MigrationResults.filter(self.data, max=5)

class DataModel:
    """
    Container, controller, and outer interface for the different objects in the
    data model.
    """

    _formats = None

    @staticmethod
    def formats():
        if DataModel._formats == None:
            with open(DATA_FORMATS_FILE, 'r') as f:
                DataModel._formats = load_yaml(f)
        return DataModel._formats

    def __init__(self):

        self.results = MigrationResults(self)
        self.locations_table = LocationsTable(self)

        self.bands = Bands()
        self.people = People()
        self.connections = Connections()
        self.cities = Cities()
        self.states = States()
        self.countries = Countries()
        self.websites = Websites()
        self.annotations = Annotations()

    def add_from_records(self, in_records, col_index, table_name):
        bands = self.bands
        people = self.people
        cities = self.cities
        states = self.states
        countries = self.countries
        websites = self.websites
        locations_table = self.locations_table

        band_results = self.results['Bands']
        people_results = self.results['People']
        city_results = self.results['Cities']
        state_results = self.results['States']
        country_results = self.results['Countries']
        website_results = self.results['Websites']

        bands_read = 0
        normalized_bands = []
        deduped_bands = {}
        deduped_bands_count = 0
        unique_bands = 0

        people_read = 0
        unique_people = 0
        normalized_people = []

        total_cities_read = 0
        unique_cities = 0
        total_states_read = 0
        unique_states = 0
        country_count = 0
        normalized_cities = []
        normalized_states = []
        normalized_countries = []

        websites_read = 0
        unique_websites = 0

        bands_with_no_city = 0
        cities_with_no_state = 0
        cities_with_multiple_states = 0

        for in_record in in_records:

            # Absorb the band info:

            # Track reads.
            bands_read += 1

            # Read fields from input record.
            b_id_1_0 = None
            if table_name == 'bands':
                b_id_1_0 = in_record[col_index['id']]
            b_name = in_record[col_index['name']]
            b_click_count = 0
            if 'click_count' in col_index:
                b_click_count = in_record[col_index['click_count']]

            # Create new band object.
            b = Band(b_id_1_0, b_name, b_click_count)

            # Track normalized band names.
            if (b_name != b.name):
                normalized_bands.append("'{}' => '{}'".format(b_name, b.name))

            # Deduplicate bands.
            if b.name in bands:
                if b.name in deduped_bands:
                    deduped_bands[b.name] = deduped_bands[b.name] + 1
                else:
                    deduped_bands[b.name] = 1
                deduped_bands_count += 1

            # Or add the unique band to the collection.
            else:
                bands[b.name] = b

                # Track band writes.
                unique_bands += 1

            # Absorb the people info:
            # Just naively split an assumed comma-delimited string for now.
            members = in_record[col_index['members']]
            members = [mname.strip() for mname in members.split(',')]

            for m in members:
                if len(m) == 0:
                    continue

                # Track person reads.
                people_read += 1

                # Create new person object.
                p = Person(m) # Zero out person click counts.

                # Track normalized people names.
                if (m != p.name):
                    normalized_people.append("'{}' => '{}'".format(m, p.name))

                # Determine person uniqueness, track multiple appearances.
                if p.name in people:
                    p = people[p.name]

                # Or add to the people collection.
                else:
                    unique_people += 1
                    people[p.name] = p

                if p.name not in b.people:
                    b.people.append(p.name)

                if b.name not in p.bands:
                    p.bands.append(b.name)

            # Absorb the city info.
            city_name = ''
            city_name_raw = in_record[col_index['city']]
            if len(city_name_raw.strip()) > 0:
                total_cities_read += 1
                city_name = City.normalize_name(city_name_raw)

                if city_name_raw != city_name:
                    normalized_cities.append("'{}' => '{}'".format(
                        city_name_raw, city_name))
            else:
                bands_with_no_city += 1

            # Absorb the state info.
            state_name = ''
            state_name_raw = in_record[col_index['state']]
            if len(state_name_raw.strip()) > 0:
                total_states_read += 1
                state_name = State.normalize_name(state_name_raw)

                if state_name_raw != state_name:
                    normalized_states.append("'{}' => '{}'".format(
                        state_name_raw, state_name))

            # If there are delimiter-looking things in the city name,
            # try parsing multiple cities on them.
            city_state_names = [(city_name, state_name)]
            city_delimiters = [',', '/', '\\', '&', ' and ', ' or ']
            def check_for_city_state_names(str):
                p_city = locations_table.get_best_city_match(str.strip(), '')
                p_city = '' if p_city == None else p_city
                if p_city != '':
                    p_state = p_city.state
                    return (p_city.name, p_state.name)
                p_state = locations_table.get_best_state_match(str.strip())
                p_state = '' if p_state == None else p_state
                if p_state != '':
                    return ('', p_state.name)
                return ('', '')
            for cd in city_delimiters:
                if cd in city_name_raw:
                    for part in city_name_raw.split(cd):
                        p_city, p_state = (
                            check_for_city_state_names(part))
                        if ((p_city != '' or p_state != '') and 
                            (p_city, p_state) not in city_state_names):
                            city_state_names.append((p_city, p_state))

            for city_name, state_name in city_state_names:

                country_name = ''

                # Look up a canonical city/state/country:
                c_city = None
                c_state = None
                c_country = None

                # Try getting a match from various parsings of the city name
                # field.
                c_city = (
                    locations_table.get_best_city_match(city_name, state_name))

                if c_city is not None and c_city in b.cities:
                    continue # already got this one.

                if c_city == None:
                    def try_delimiter(s, d):
                        if d not in s:
                            return (None, None)
                        parts = s.split(d)
                        possible_city = None
                        possible_state = None
                        for p in parts:
                            possible_city = (
                                locations_table.get_best_city_match(p, ''))
                            if possible_city == None:
                                possible_state = (
                                    locations_table.get_best_state_match(p))
                            else:
                                return (possible_city, possible_city.state)
                        return (possible_city, possible_state)

                    for d in [',', '/', '\\', '&', ' and ',
                        ' or ', '+', ' now ', ' was ']:
                        p_city, p_state = try_delimiter(city_name, d)
                        if p_city is not None:
                            c_city = p_city
                            break
                        if p_state is not None and c_state is None:
                            c_state = p_state

                if c_city == None:
                    if city_name != '':
                        nc_entry = "Band: '{}', City: '{}', State: '{}'".format(
                            b.name, city_name, state_name)
                        niltwr = (
                            city_results["Not In Lookup Table (Won't Be Written)"])
                        niltwrc = "Not In Lookup Table (Won't Be Written) Count"
                        city_results[niltwrc] += 1
                        if nc_entry not in niltwr:
                            niltwr[nc_entry] = 1
                        else:
                            niltwr[nc_entry] += 1
                else:
                    if state_name == '':
                        aasc = ('Assigned A State/Country Through Lookup '
                            'Table Count')
                        city_results[aasc] += 1
                        aas = (city_results[
                            'Assigned A State/Country Through Lookup Table'])
                        aas_entry_key = '{} => {}'.format(
                            city_name, c_city.fullname())
                        if aas_entry_key in aas:
                            aas[aas_entry_key] += 1
                        else:
                            aas[aas_entry_key] = 1
                    city_name = c_city.name
                    c_state = c_city.state
                    state_name = c_state.name
                    c_country = c_state.country
                    country_name = c_country.name

                if c_state == None and state_name != '':

                    # Special case: "city" = "UK" or "state" = "UK"
                    if city_name.lower() == 'england':
                        city_name = ''
                        state_name = 'England'
                    if city_name.lower() == 'uk' and state_name == '':
                        city_name = ''
                        state_name = 'UK'
                    if state_name.lower() == 'uk':
                        state_name = ''
                        country_name = 'UK'
                        c_country = locations_table.countries['UK']
                    else:

                        c_state = locations_table.get_best_state_match(state_name)
                        if c_state == None:
                            ns_entry = "Band: '{}', State: '{}'".format(
                                b.name, state_name)
                            niltwr = (state_results[
                                "Not In Lookup Table (Won't Be Written)"])
                            niltwrc = ("Not In Lookup Table (Won't Be Written) "
                                "Count")
                            state_results[niltwrc] += 1
                            if nc_entry not in niltwr:
                                niltwr[ns_entry] = 1
                            else:
                                niltwr[ns_entry] += 1
                        else:
                            state_name = c_state.name
                            c_country = c_state.country
                            country_name = c_country.name

                criflt = country_results['Inferred From Lookup Table']
                if (c_country != None and c_country.name not in criflt):
                    country_results['Inferred From Lookup Table Count'] += 1
                    criflt.append(country_name)
                    countries[country_name] = c_country

                # Correlate the band, city, state, and country info.
                country = None
                state = None
                city = None
                cities_with_multiple_states = []

                if state_name != '':
                    total_states_read += 1
                    # Look up the state or make a new one.
                    if c_state is not None:
                        state = c_state
                    else:
                        state = State(state_name, None)

                if (state_name, country_name) not in states:
                    unique_states += 1
                    states[state_name, country_name] = state

                if city_name != '':
                    total_cities_read += 1

                    # Look up the city or make a new one.
                    if c_city is not None:
                        city = c_city
                    else:
                        city = City(city_name, state)

                    if (city_name, state_name) not in cities:
                        unique_cities += 1
                        cities[city_name, state_name] = city


                    b.cities.append(city)
                    city.bands.append(b)

                    all_cities = cities.get_all(city_name)
                    if len(all_cities) > 1:
                        if city.fullname() not in cities_with_multiple_states:
                            cities_with_multiple_states.append(city.fullname())

                    if state == None:
                        cities_with_no_state += 1

                    else:
                        state.cities.append(city)

                        # Remove the orphaned city entry for this city name,
                        # if there was one, transferring any bands to the new city.
                        if (city_name, '') in cities:
                            old_city = cities[city_name, '']
                            for bb in old_city.bands:
                                bb.city = city
                                city.bands.append(bb)
                            del cities[city_name, '']

                else:
                    if len(city_state_names) == 1:
                        bands_with_no_city += 1

            # Read website info.
            ws_url = in_record[col_index['website']]

            # Create new website object.
            ws = Website(ws_url, b)

            # Deduplicate or add to websites list.
            if len(ws.url) > 0:
                websites_read += 1
                if ws.url not in websites:
                    unique_websites += 1
                    websites[ws.url] = ws
                elif b not in websites[ws.url].bands:
                    websites[ws.url].bands.append(b)
                    wwmb = website_results['Websites With Multiple Bands']
                    wwmb[ws.url] = [wsb.name for wsb in websites[ws.url].bands]

        # Summarize results.

        band_results['Read'] += bands_read
        band_results['Normalized Names Count'] += len(normalized_bands)
        band_results['Normalized Names'] += normalized_bands
        band_results['Deduplicated Count'] += deduped_bands_count
        rbd = band_results['Deduplicated']
        for k, v in deduped_bands.items():
            if k in rbd:
                rbd[k] = rbd[k] + v
            else:
                rbd[k] = v
        band_results['Unique'] += unique_bands
        if verbose:
            print(('    Found {} unique / {} total band records, '
                'normalized {} names, deduplicated {}.').format(
                unique_bands, bands_read, len(normalized_bands), deduped_bands_count))

        people_results['Total Read'] += people_read
        people_results['Unique'] += unique_people
        if verbose:
            print(('    Found {} unique / {} total person records, '
                'normalized {} names.').format(
                unique_people, people_read, len(normalized_people)))

        city_results['Total Read'] += total_cities_read
        city_results['Unique'] += unique_cities
        city_results['Normalized Count'] += len(normalized_cities)
        city_results['Normalized'] += normalized_cities
        state_results['Total Read'] += total_states_read
        state_results['Unique'] += unique_states
        state_results["Normalized (like 'Wa' => 'WA') Count"] += len(
            normalized_states)
        state_results["Normalized (like 'Wa' => 'WA')"] += normalized_states

        website_results['Total Read'] += websites_read
        website_results['Unique'] += unique_websites

        if verbose:
            print(('    Found {} unique / {} total city records.  '
                'Normalized {} names.').format(
                unique_cities, total_cities_read, len(normalized_cities)))
            print(('    Found {} unique / {} total state records in '
                '{} countries.  Normalized {} names.').format(
                unique_states, total_states_read, len(countries.data),
                len(normalized_states)))
            print('    Found {} bands with no city.'.format(
                bands_with_no_city))
            print('    Found {} cities with no state.'.format(
                cities_with_no_state))
            print('    Found {} cities with multiple states.'.format(
                len(cities_with_multiple_states)))
            print('    Found {} websites.'.format(unique_websites))


    def add_from_table(self, in_records, table_name):
        if verbose:
            print("  Organizing records from '{}' table.".format(table_name))
        if table_name == 'connections':
            self.add_from_connection_records(in_records[table_name])
        else:
            col_index = DataModel.formats()['input_col_index'][table_name]
            self.add_from_records(in_records[table_name], col_index, table_name)

    def add_from_connection_records(self, in_records):
        col_index = DataModel.formats()['input_col_index']['connections']
        bands = self.bands
        connections = self.connections
        null_connections = []

        for in_record in in_records:
            null_bands = []
            band1_id_1_0 = in_record[col_index['band1']]
            band2_id_1_0 = in_record[col_index['band2']]
            band1 = band2 = None
            if band1_id_1_0 in bands.by_id_1_0:
                band1 = bands.by_id_1_0[band1_id_1_0]
            else:
                null_bands.append(band1_id_1_0)
            if band2_id_1_0 in bands.by_id_1_0:
                band2 = bands.by_id_1_0[band2_id_1_0]
            else:
                null_bands.append(band2_id_1_0)

            if len(null_bands) > 0:
                band1 = (band1 if band1 is not None else
                    Band(band1_id_1_0, 'null', 0))
                band2 = (band2 if band2 is not None else
                    Band(band2_id_1_0, 'null', 0))
                nc = "({} ({}), {} ({}))".format(
                    band1.id_1_0, band1.name, band2.id_1_0, band2.name)
                null_connections.append(nc)
                continue

            connections.append((band1, band2))

        total_count = len(in_records)
        nc_count = len(null_connections)
        good_count = len(connections)

        print('    Found {} unique / {} total connection records.  '
            'Discarded {} with bad band ids, {} duplicates.'.format(
                good_count, total_count, nc_count,
                (total_count - nc_count - good_count)))

        self.results['Connections']['Read'] += total_count
        self.results['Connections']['Valid and Unique'] += good_count

    def write_to_db(self, cursor):
        if verbose:
            print('  Records Written:')
        r = self.results
        # Map each data model object to the 2.0 DB type and write out.

        # Roles.
        sql = 'INSERT INTO roles (name) VALUES (%s);'
        values = [['Member']]
        cursor.executemany(sql, values)

        # Track write count.
        if verbose:
            print('            roles: {}'.format(len(values)))

        # Read assigned role ids.
        sql = 'SELECT * FROM roles;'
        cursor.execute(sql)
        records = cursor.fetchall()
        col_index = DataModel.formats()['output_col_index']['roles']
        role_ids = {}
        for rec in records:
            role_ids[rec[col_index['name']]] = rec[col_index['id']]

        # People.
        sql = 'INSERT INTO people (name) VALUES (%s);'
        values = [[p.name] for p in self.people]
        cursor.executemany(sql, values)

        # Track write count.
        if verbose:
            print('           people: {}'.format(len(values)))

        # Read assigned person ids.
        sql = 'SELECT * FROM people;'
        cursor.execute(sql)
        records = cursor.fetchall()
        col_index = DataModel.formats()['output_col_index']['people']
        for rec in records:
            p = self.people[rec[col_index['name']]]
            p_id_2_0 = rec[col_index['id']]
            p.id_2_0 = p_id_2_0
            self.people.by_id_2_0[p_id_2_0] = p

        # Countries.
        sql = 'INSERT INTO countries (name) VALUES (%s);'
        countries = self.countries.filter(self.locations_table.countries)
        values = [[c.name] for c in countries]
        cursor.executemany(sql, values)

        # Track write count.
        if verbose:
            print('        countries: {}'.format(len(values)))

        # Read assigned country ids.
        sql = 'SELECT * FROM countries;'
        cursor.execute(sql)
        records = cursor.fetchall()
        col_index = DataModel.formats()['output_col_index']['countries']
        for rec in records:
            c = self.countries[rec[col_index['name']]]
            c_id_2_0 = rec[col_index['id']]
            c.id_2_0 = c_id_2_0
            self.countries.by_id_2_0[c_id_2_0] = c

        # States.
        sql = 'INSERT INTO states (name, country_id) VALUES (%s, %s);'
        states = self.states.filter(self.locations_table.states)
        values = [(s.name, self.countries[s.country.name].id_2_0)
            for s in states]
        cursor.executemany(sql, values)

        # Track write count.
        if verbose:
            print('           states: {}'.format(len(values)))

        # Read assigned state ids.
        sql = 'SELECT * FROM states;'
        cursor.execute(sql)
        records = cursor.fetchall()
        col_index = DataModel.formats()['output_col_index']['states']
        for rec in records:
            s = self.states[rec[col_index['name']],
                self.countries.by_id_2_0[rec[col_index['country_id']]].name]
            s_id_2_0 = rec[col_index['id']]
            s.id_2_0 = s_id_2_0
            self.states.by_id_2_0[s_id_2_0] = s

        # Cities.
        sql = 'INSERT INTO cities (name, state_id) VALUES (%s, %s);'
        cities = self.cities.filter(self.locations_table.cities)
        values = [(c.name,
                self.states[c.state.name, c.state.country.name].id_2_0)
                for c in cities]
        cursor.executemany(sql, values)

        # Track write count.
        if verbose:
            print('           cities: {}'.format(len(values)))

        # Read assigned city ids.
        sql = 'SELECT * FROM cities;'
        cursor.execute(sql)
        records = cursor.fetchall()
        col_index = DataModel.formats()['output_col_index']['cities']
        for rec in records:
            c = self.cities[rec[col_index['name']],
                self.states.by_id_2_0[rec[col_index['state_id']]].name]
            c_id_2_0 = rec[col_index['id']]
            c.id_2_0 = c_id_2_0
            self.cities.by_id_2_0[c_id_2_0] = c

        # Info Sources.
        sql = 'INSERT INTO info_sources (url) VALUES (%s);'
        values = [[w.url] for w in self.websites] # No website descriptions.
        cursor.executemany(sql, values)

        # Track write count.
        if verbose:
            print('     info_sources: {}'.format(len(values)))

        # Read assigned info_source ids.
        sql = 'SELECT * FROM info_sources;'
        cursor.execute(sql)
        records = cursor.fetchall()
        col_index = DataModel.formats()['output_col_index']['info_sources']
        for rec in records:
            w = self.websites[rec[col_index['url']]]
            w.id_2_0 = rec[col_index['id']]
            self.websites.by_id_2_0[w.id_2_0] = w

        # Annotations.

        # Bands.
        sql = 'INSERT INTO bands (name, click_count) VALUES (%s, %s);'
        values = [(b.name, b.click_count) for b in self.bands]
        cursor.executemany(sql, values)

        # Track write count.
        if verbose:
            print('            bands: {}'.format(len(values)))

        # Read assigned band ids.
        sql = 'SELECT * FROM bands;'
        cursor.execute(sql)
        records = cursor.fetchall()
        col_index = DataModel.formats()['output_col_index']['bands']
        for rec in records:
            b = self.bands[rec[col_index['name']]]
            b_id_2_0 = rec[col_index['id']]
            b.id_2_0 = b_id_2_0
            self.bands.by_id_2_0[b_id_2_0] = b

        # band_person_roles
        sql = ('INSERT INTO band_person_roles (band_id, person_id, role_id) '
            'VALUES (%s, %s, %s);')
        values = []
        for b in self.bands:
            for p_name in b.people:
                p = self.people[p_name]
                values.append((b.id_2_0, p.id_2_0, role_ids['Member']))
        cursor.executemany(sql, values)

        # Track write count.
        if verbose:
            print('band_person_roles: {}'.format(len(values)))

        # band_cities
        sql = ('INSERT INTO band_cities (band_id, city_id) VALUES (%s, %s);')
        values = []
        for b in self.bands:
            for c in b.cities:
                if c.id_2_0 is not None:
                    values.append((b.id_2_0, c.id_2_0))
        cursor.executemany(sql, values)

        # Track write count.
        if verbose:
            print('      band_cities: {}'.format(len(values)))

        # Connections.
        sql = ('INSERT INTO connections (band_1_id, band_2_id, description) '
            'VALUES (%s, %s, %s);')
        values = []
        self.connections.sort()
        for c in self.connections:

            # Try to infer a "Shared Members" description.
            description = ''
            b1 = self.bands.by_id_2_0[c[0].id_2_0]
            b2 = self.bands.by_id_2_0[c[1].id_2_0]
            people1 = b1.people
            people2 = b2.people
            shared_p = []
            for b1_p_name in b1.people:
                for b2_p_name in b2.people:
                    if b1_p_name == b2_p_name:
                        if b1_p_name not in shared_p:
                            shared_p.append(b1_p_name)
            if len(shared_p) > 0:
                description = 'Shared Members: {}.'.format(', '.join(shared_p))

            values.append(
                (c[0].id_2_0, c[1].id_2_0, description))

        cursor.executemany(sql, values)

        # Track write count.
        if verbose:
            print('      connections: {}'.format(len(values)))

        # band_info_sources
        sql = ('INSERT INTO band_info_sources (band_id, info_source_id) '
            'VALUES (%s, %s);')
        values = []
        for w in self.websites:
            for b in w.bands:
                if b.id_2_0 is not None:
                    values.append((b.id_2_0, w.id_2_0))
        cursor.executemany(sql, values)

        # Track write count.
        if verbose:
            print('band_info_sources: {}'.format(len(values)))


"""
Main Script
"""

def main():

    """
    Ingest input tables: bands, connections, pending_bands, pending_connections.
      bands: in_id, name, city, state, click_count,
             last_updated (=>annotation), website, members (=>people)
      pending_bands: in_id, name, city, state, website, members, connections
      connections: in_band1_id, in_band2_id
      pending_connections: in_id, band1_name, band2_name, description
    Sort ingested records into the new data model.
      Normalize band and person names.
      Deduplicate bands and people.
      Normalize pending connection descriptions.
      Try to extract band and people annotations and connection descriptions
        from the pending connection descriptions.
      Describe unexplained connections where possible (if shared members found).
      Infer band members from connection descriptions.
      Deduplicate cities and states.
      Infer cities' states and countries.
    Drop the 2.0 database and recreate (empty).
    Create the 2.0 schema with the 2.0 creation script.
    Output normalized data to 2.0 database.
    """

    # Connect to the bandmap 1.0 db on the 1.0 db server.
    connection = mysql_connect(**in_db)
    try:
        print('Ingesting input database tables.')
        in_tables = [
            'bands', 'pending_bands', 'connections', 'pending_connections']
        in_records = CommentedMap(OrderedDict())
        with connection.cursor() as cursor:
            for in_table in in_tables:
                if verbose:
                    print("  Ingesting table: {}.".format(in_table))
                sql = 'SELECT * FROM `{}`;'.format(in_table)
                cursor.execute(sql)
                in_records[in_table] = cursor.fetchall()
    finally:
        connection.close()
    print()

    print('Organizing records into intermediate data model.')
    data_model = DataModel()
    data_model.add_from_table(in_records, 'bands')
    data_model.add_from_table(in_records, 'pending_bands')
    data_model.add_from_table(in_records, 'connections')

    """
      Organizing records from 'pending_connections' table.
          Found {} connection records, deduplicated {}, found {} descriptions.
    """
    print()

    if verbose:
        dmr = data_model.results.get_filtered()

        print('Found:')
        print('  Bands: {}'.format(dmr['Bands']['Read']))
        print('  People: {}'.format(dmr['People']['Unique']))
        print('  Connections: {}'.format(dmr['Connections']['Read']))
        print('  Cities: {}'.format(dmr['Cities']['Unique']))
        print('  States: {}'.format(dmr['States']['Unique']))
        print('  Countries: {}'.format(
            dmr['Countries']['Inferred From Lookup Table Count']))
        print('  Websites: {}'.format(dmr['Websites']['Unique']))
        print()

        # Summarize and print detailed ingestion results.
        print('Details:')
        print(dump_yaml(dmr, indent=2))

    # Connect to the 2.0 db server.
    print('Dropping the 2.0 database and recreating (empty).')
    out_server = {
        'host': out_db['host'],
        'port': out_db['port'],
        'user': out_db['user'],
        'password': out_db['password']
    }
    connection = pg_connect(**out_server)
    try:
        connection.autocommit = True
        with connection.cursor() as cursor:
            cursor.execute('DROP DATABASE IF EXISTS bandmap;')
            cursor.execute('CREATE DATABASE bandmap;')
    finally:
        connection.close()
    print()

    # Connect to the bandmap 2.0 db on the 2.0 db server.
    connection = pg_connect(**out_db)
    try:
        connection.autocommit = True
        with connection.cursor() as cursor:

            print('Creating the 2.0 schema with the 2.0 creation script.')
            exec_sql_file(cursor, out_db_create_script)
            print()

            print('Saving the reorganized data to the 2.0 database.')

            data_model.write_to_db(cursor)

    finally:
        connection.close()

if __name__ == '__main__':

    # Parse CLI arguments.
    parser = argparse.ArgumentParser()
    parser.add_argument('-v', '--verbose', help='print more stuff',
        action='store_true')
    parser.add_argument('-vv', '--very_verbose', help='print way more stuff',
        action='store_true')
    args = parser.parse_args()
    very_verbose = args.very_verbose
    verbose = args.verbose or very_verbose

    main()
