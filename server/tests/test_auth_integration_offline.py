"""Additional local-only acceptance evidence; synthetic ASGI requests, no sockets."""
import pytest
from fastapi.testclient import TestClient
from execflow import api

@pytest.fixture
def service(monkeypatch, tmp_path):
    monkeypatch.setenv('EXECFLOW_API_TOKEN', 'synthetic-old-token')
    monkeypatch.setenv('EXECFLOW_MODE', 'mock')
    monkeypatch.setenv('EXECFLOW_PROVIDER', 'mock')
    monkeypatch.setattr(api, 'DATA_ROOT', tmp_path)
    monkeypatch.setattr(api, 'DATASETS', tmp_path / 'datasets')
    monkeypatch.setattr(api, '_memory', None)
    return TestClient(api.app), tmp_path


def test_real_storage_remains_unchanged_on_denied_requests(service, monkeypatch):
    client, root = service
    good = {'Authorization': 'Bearer synthetic-old-token'}
    up = client.post('/api/upload', headers=good, files={'file': ('synthetic.csv', b'Category,Value\nA,10\nB,20\n')})
    assert up.status_code == 200
    dataset = up.json()['dataset']['id']
    saved = client.post('/api/memory', headers=good, json={'kind': 'preference', 'text': 'synthetic memory'})
    assert saved.status_code == 200
    mid = saved.json()['id']
    run = client.post('/api/analyse', headers=good, json={'dataset_id': dataset, 'lang': 'en'})
    assert run.status_code == 200
    rid = run.json()['run_id']
    snapshot = {str(p.relative_to(root)): p.read_bytes() for p in root.rglob('*') if p.is_file()}
    requests = [('GET', '/api/datasets/' + dataset, {}), ('GET', f'/api/runs/{rid}/report.md', {}), ('GET','/api/memory.md',{}), ('DELETE', '/api/memory/' + mid, {}), ('POST','/api/analyse',{'json':{'dataset_id':dataset,'lang':'en'}}), ('POST','/api/upload',{'files':{'file':('x.csv',b'x\n1\n')}})]
    for headers in ({}, {'Authorization':'Bearer wrong'}):
        for method, path, kwargs in requests:
            response = client.request(method,path,headers=headers,**kwargs)
            assert response.status_code == 401
            assert response.headers['cache-control'] == 'no-store'
    assert snapshot == {str(p.relative_to(root)): p.read_bytes() for p in root.rglob('*') if p.is_file()}
    monkeypatch.setenv('EXECFLOW_API_TOKEN','synthetic-new-token')
    assert client.get('/api/memory.md',headers=good).status_code == 401
    fresh = {'Authorization':'Bearer synthetic-new-token'}
    assert 'synthetic memory' in client.get('/api/memory.md',headers=fresh).text
    assert client.get(f'/api/runs/{rid}/report.md',headers=fresh).status_code == 200

@pytest.mark.parametrize('path',['/api','/api/','/api/%68ealth','/docs/oauth2-redirect','/openapi.json'])
def test_encoded_namespace_and_docs_fail_closed(service,path):
    client, root = service
    assert client.get(path).status_code == 401
    assert not list(root.iterdir())


def test_cors_preflight_cannot_mutate_storage(service):
    client, root = service
    for origin, status in [('http://localhost:5173',200),('https://untrusted.invalid',400)]:
        r=client.options('/api/memory',headers={'Origin':origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'})
        assert r.status_code == status
        assert r.headers['cache-control']=='no-store'
    assert not list(root.iterdir())
    assert client.post('/api/memory',headers={'Origin':'http://localhost:5173'},json={'kind':'preference','text':'synthetic'}).status_code==401
