import copy
import importlib.util
import json
import os
from pathlib import Path
import sys
import unittest
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('recovery_candidate', ROOT/'scripts/oracle-recovery-caddy.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
HASH = '$2a$14$' + 'a' * 53
KEY = 'ab' * 32

def fixture():
    routes = []
    for route, port in [('/lora/*',5050), ('/lab/*',8080), ('/bga/*',8082),
                        ('/amazonia/*',8083), ('/*',3000)]:
        proxy = {'handler':'reverse_proxy',
                 'upstreams':[{'dial':'127.0.0.1:'+str(port)}], 'flush_interval':-1}
        routes.append({'match':[{'path':[route]}], 'handle':[proxy]})
    site = {'match':[{'host':['atelierconceptionjeu.fr','www.atelierconceptionjeu.fr']}],
            'handle':[{'handler':'subroute','routes':routes}]}
    server = {'listen':[':443'], 'routes':[site]}
    return {'admin':{'listen':'127.0.0.1:2019'}, 'apps': {
        'tls':{'automation':{'policies':[{'subjects':['atelierconceptionjeu.fr']}]}},
        'http':{'servers':{'srv0':server}},
    }}

class RecoveryCaddyTests(unittest.TestCase):
    def test_preserves_neighbors_tls_admin_and_input(self):
        original = fixture()
        before = copy.deepcopy(original)
        result = m.protect(original, 'amazonia', HASH, KEY)
        self.assertEqual(original, before)
        self.assertEqual(result['admin'], original['admin'])
        self.assertEqual(result['apps']['tls'], original['apps']['tls'])
        old_routes = original['apps']['http']['servers']['srv0']['routes'][0]['handle'][0]['routes']
        routes = result['apps']['http']['servers']['srv0']['routes'][0]['handle'][0]['routes']
        self.assertEqual(routes[:3], old_routes[:3])
        for route in routes[3:]:
            wrapper = route['handle'][0]
            self.assertEqual(wrapper['routes'][0]['handle'][0]['handler'], 'authentication')
            proxy = wrapper['routes'][1]['handle'][0]
            self.assertEqual(proxy['headers']['request']['set']['X-Atelier-Internal'], [KEY])
            self.assertIn('Authorization', proxy['headers']['request']['delete'])
    def test_rejects_unknown_topology_auth_duplicates_and_missing_proxy(self):
        for mutation in ('external', 'extra', 'missing', 'auth'):
            conf = fixture()
            routes = conf['apps']['http']['servers']['srv0']['routes'][0]['handle'][0]['routes']
            if mutation == 'external':
                routes[-1]['handle'][0]['upstreams'][0]['dial'] = 'remote.invalid:3000'
            elif mutation == 'extra':
                routes.append(copy.deepcopy(routes[-1]))
            elif mutation == 'missing':
                routes.pop()
            else:
                routes.append({'handle': [{'handler': 'authentication'}]})
            with self.assertRaises(ValueError):
                m.protect(conf, 'amazonia', HASH, KEY)
    def test_credential_validation_and_no_plaintext_configuration(self):
        for user, hashed, key in [('x y',HASH,KEY), ('amazonia','plaintext',KEY),
                                  ('amazonia',HASH,'short')]:
            with self.assertRaises(ValueError):
                m.protect(fixture(), user, hashed, key)
    def test_does_not_modify_raw_public_snapshot(self):
        original = fixture()
        raw = json.dumps(original, sort_keys=True)
        m.protect(original, 'amazonia', HASH, KEY)
        self.assertEqual(raw, json.dumps(original, sort_keys=True))

if __name__ == '__main__':
    unittest.main()
