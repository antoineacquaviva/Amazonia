"""Real Caddy 2.11.7 validation, Basic auth and proof replacement; fixtures only."""
import base64
import copy
import http.server
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('candidate', ROOT/'scripts/oracle-recovery-caddy.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
caddy = os.environ['CADDY_TEST_BINARY']
password = 'fixture-password-only'
key = '12' * 32
hashed = subprocess.check_output([caddy, 'hash-password', '--algorithm', 'bcrypt',
                                   '--bcrypt-cost', '4'], input=(password+'\n').encode()).decode().strip()
class Echo(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        data = json.dumps({'proof':self.headers.get('X-Atelier-Internal'),
                           'authorization':self.headers.get('Authorization')}).encode()
        self.send_response(200)
        self.send_header('Content-Type','application/json')
        self.end_headers()
        self.wfile.write(data)
    def log_message(self, *args):
        pass
backends = [http.server.ThreadingHTTPServer(('127.0.0.1',0),Echo) for _ in range(3)]
for b in backends:
    threading.Thread(target=b.serve_forever,daemon=True).start()
ports = [b.server_port for b in backends]
with socket.socket() as s:
    s.bind(('127.0.0.1',0)); front=s.getsockname()[1]
routes = [{'match':[{'path':[prefix+'/*']}], 'handle':[{
    'handler':'reverse_proxy','upstreams':[{'dial':'127.0.0.1:'+str(port)}]
}]} for prefix,port in zip(('/portal','/amazonia','/lora'),ports)]
original = {'admin':{'disabled':True},'apps':{'http':{'servers':{'test':{
    'listen':['127.0.0.1:'+str(front)],'automatic_https':{'disable':True},'routes':routes
}}}}}
candidate=m.protect(original,'amazonia',hashed,key,set(ports),set(ports[:2]))
assert candidate['apps']['http']['servers']['test']['routes'][2] == routes[2]
proc = None
def request(prefix, headers=None):
    req=urllib.request.Request('http://127.0.0.1:%d%s/x'%(front,prefix),headers=headers or {})
    try:
        with urllib.request.urlopen(req,timeout=3) as r:
            return r.status,json.load(r)
    except urllib.error.HTTPError as e:
        return e.code,None
try:
    with tempfile.TemporaryDirectory(prefix='caddy-recovery-fixture-') as d:
        config=Path(d)/'candidate.json'
        config.write_text(json.dumps(candidate))
        with tempfile.TemporaryFile() as log:
            subprocess.run([caddy,'validate','--config',str(config)],stdout=log,stderr=log,check=True)
            proc=subprocess.Popen([caddy,'run','--config',str(config)],stdout=log,stderr=log)
            end=time.monotonic()+10
            while True:
                try:
                    if request('/portal')[0]==401:
                        break
                except OSError:
                    pass
                assert proc.poll() is None and time.monotonic()<end
                time.sleep(.05)
            auth='Basic '+base64.b64encode(('amazonia:'+password).encode()).decode()
            for prefix in ('/portal','/amazonia'):
                assert request(prefix)[0]==401
                assert request(prefix,{'X-Atelier-Internal':key})[0]==401
                assert request(prefix,{'Authorization':'Basic Zm9vOmJhcg=='})[0]==401
                status,body=request(prefix,{'Authorization':auth,'X-Atelier-Internal':'forged'})
                assert status==200 and body['proof']==key and body['authorization'] is None
            status,body=request('/lora',{'Authorization':'Bearer neighbor-fixture'})
            assert status==200 and body['authorization']=='Bearer neighbor-fixture' and body['proof'] is None
            print('PASS: actual Caddy validation, protected proxies/auth/spoof refusal, neighbors unchanged')
finally:
    if proc is not None:
        proc.terminate()
        proc.wait(timeout=10)
    for b in backends:
        b.shutdown()
        b.server_close()
