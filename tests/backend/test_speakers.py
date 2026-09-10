"""Isolated tests: no microphone, external services, or user data."""
import os
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace as NS
import json
import wave

os.environ['AGUACATE_DATA_DIR'] = tempfile.mkdtemp(prefix='aguacate-speaker-tests-')
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
import pytest
import numpy as np
from app.config import ensure_dirs, TRANSCRIPTS_DIR
from app.db import get_db, set_setting, close_db
from app.services import speakers, transcriber, speaker_models
from app.services.speaker_capture import SpeakerCapture, call_key
from app.services.recorder import recorder, Recorder
from app.routes.speakers import bridge_router, BRIDGE_TOKEN, router
from fastapi import FastAPI
from fastapi.testclient import TestClient

ensure_dirs()


@pytest.fixture(autouse=True)
def isolated():
    db = get_db()
    db.execute('DELETE FROM meetings'); db.execute('DELETE FROM settings'); db.commit()
    recorder._meeting_id = None; recorder.paused = False; recorder.muted = False; recorder._captures = []
    yield
    recorder._meeting_id = None; recorder._captures = []


def turn(a=0, b=5, sid='speaker_1'):
    return dict(start=a, end=b, speaker_id=sid)


def events(a=0, b=5, name='Maya', pid='p1'):
    return [dict(audio_time=float(t), source='meet', participants=[dict(id=pid, name=name)]) for t in np.arange(a, b + .01, .25)]


def meeting(mid='test'):
    get_db().execute('INSERT INTO meetings(id,title,started_at,status) VALUES(?,?,?,?)', (mid,'Synthetic','2026-01-01','ready')); get_db().commit()


def test_consistent_names_and_returning_voice():
    turns = [turn(), turn(5,10,'speaker_2'),turn(10,15)]
    data = events(0,4.75) + events(5,9.75,'Alex','p2') + events(10,15)
    names = speakers.resolve_names(turns, data)
    assert names['speaker_1']['name'] == 'Maya'
    assert names['speaker_2']['name'] == 'Alex'


@pytest.mark.parametrize('data', [[], events(0,1), events(0,2,'Maya') + events(2.25,5,'Alex','p2'), [{'audio_time':0,'source':'meet','participants':[{'id':'p1','name':'Maya'}]}, {'audio_time':5,'source':'meet','participants':[{'id':'p1','name':'Maya'}]}]])
def test_missing_stale_conflicting_evidence_abstains(data):
    assert speakers.resolve_names([turn()], data) == {}


def test_overlap_abstains():
    assert speakers.resolve_names([turn(),turn(0,5,'speaker_2')],events()) == {}
    data = events()
    for event in data: event['participants'].append({'id':'p2','name':'Alex'})
    assert speakers.resolve_names([turn()],data) == {}


def test_rename_shared_room_and_duplicate_names():
    data = events(0,2.25,'Room 4') + events(2.5,5,'Room 5')
    assert speakers.resolve_names([turn()],data)['speaker_1']['name'] == 'Room 5'
    segments = [{'start':0,'end':2,'text':'Hello there.', 'words':[{'start':0,'end':1,'word':'Hello'},{'start':1,'end':2,'word':' there.'}]}]
    names = {s:{'name':'Alex','source':'meet'} for s in ['speaker_1','speaker_2']}
    out = speakers.align_words(segments,[turn(0,1),turn(1,2,'speaker_2')],names)
    assert [s['speaker'] for s in out] == ['Alex (Speaker 1)','Alex (Speaker 2)']
    assert ' '.join(s['text'] for s in out) == 'Hello there.'


def test_fallback_text_and_unknown_word_never_disappear():
    segments = [{'start':0,'end':1,'text':'First.'},{'start':1,'end':2,'text':'Second.'}]
    assert speakers.align_words(segments,[turn()],{})[0]['text'] == 'First. Second.'
    out = speakers.align_words([{'start':0,'end':3,'text':'Keep all of this.'}], [turn(0,1),turn(1,3,'speaker_2')],{})
    assert out[0]['speaker_id'] is None and out[0]['text'] == 'Keep all of this.'


def test_word_redaction_and_offset():
    set_setting('redact_words',['Maya Chen'])
    seg = NS(start=0,end=2,text='Maya Chen agreed.',words=[NS(start=0,end=1,word='Maya'),NS(start=1,end=2,word=' Chen agreed.')])
    serialized = transcriber.serialize_segment(seg)
    assert serialized['text'] == '█████ agreed.' and serialized['words'] == []
    set_setting('redact_words',[])
    serialized = transcriber.serialize_segment(seg)
    transcriber.offset_segment(serialized,60)
    assert serialized['start'] == 60 and serialized['words'][1]['start'] == 61
    missing_space=NS(start=0,end=2,text='Two words',words=[NS(start=0,end=1,word='Two'),NS(start=1,end=2,word='words')])
    assert transcriber.serialize_segment(missing_space)['words']==[]


def test_both_whisper_paths_request_words(monkeypatch,tmp_path):
    calls=[]
    class Model:
        def transcribe(self,audio,**kwargs):
            calls.append(kwargs)
            return iter([NS(start=0,end=1,text='Test.',words=[NS(start=0,end=1,word='Test.')])]), NS(duration=1,language='en')
    monkeypatch.setattr(transcriber,'_load_model',lambda:Model())
    monkeypatch.setattr(transcriber,'is_available',lambda:True)
    full=transcriber.transcribe('test',tmp_path/'unused.wav')
    incremental=transcriber.transcribe_array(np.zeros(16000,dtype=np.float32),60)
    assert full['segments'][0]['words'][0]['start'] == 0
    assert incremental[0]['words'][0]['start'] == 60
    assert all(c['word_timestamps'] for c in calls)


def test_failure_preserves_transcript(monkeypatch):
    set_setting('speaker_identification',True)
    monkeypatch.setattr(speaker_models,'ready',lambda:True)
    monkeypatch.setattr(speakers,'acoustic_turns',lambda _: (_ for _ in ()).throw(RuntimeError('model failed')))
    result=speakers.analyze('test','unused',{'text':'Preserve this.','segments':[{'start':0,'end':1,'text':'Preserve this.'}]})
    assert result['text'] == 'Preserve this.' and result['speaker_analysis']['status'] == 'failed'
    assert 'speaker' not in result['segments'][0]


def test_audio_clock_pause_mute_and_session_boundaries(monkeypatch):
    meeting(); set_setting('speaker_identification',True); set_setting('redact_words',['Maya'])
    clock=[100.0]; monkeypatch.setattr('app.services.speaker_capture.time.time',lambda:clock[0])
    recorder._meeting_id='test'; recorder._captures=[NS(total_frames=160000,samplerate=16000)]
    capture=SpeakerCapture(); capture.start('test','https://meet.google.com/abc-defg-hij')
    assert not capture.offer('meet','tab1','https://meet.google.com/xxx-yyyy-zzz')['collect']
    clock[0]+=3
    assert not capture.offer('meet','tab1','https://meet.google.com/abc-defg-hij')['collect']
    clock[0]+=1.1; answer=capture.offer('meet','tab1','https://meet.google.com/abc-defg-hij')
    assert answer['collect']
    assert capture.ingest(answer['session'],'meet','tab1',clock[0]-.1,[{'id':'p1','name':'Maya'}])
    event=get_db().execute('SELECT * FROM speaker_events').fetchone()
    assert event['audio_time'] == pytest.approx(9.9)
    assert 'Maya' not in event['participants'] and 'p1' not in event['participants']
    assert not capture.ingest(answer['session'],'meet','tab1',clock[0]-2,[])
    assert not capture.ingest(answer['session'],'meet','tab1',clock[0]+1,[])
    recorder.paused=True
    assert not capture.available()
    recorder.paused=False; recorder.muted=True
    assert not capture.available()
    recorder.muted=False; capture.boundary()
    assert not capture.ingest(answer['session'],'meet','tab1',clock[0],[])
    capture.reset(); assert not capture.available()


def test_multiple_calls_abstain(monkeypatch):
    meeting(); set_setting('speaker_identification',True); recorder._meeting_id='test'
    clock=[0];monkeypatch.setattr('app.services.speaker_capture.time.time',lambda:clock[0])
    capture=SpeakerCapture();capture.start('test')
    capture.offer('meet','tab1');capture.offer('zoom','window1')
    clock[0]=1.1
    assert not capture.offer('meet','tab1')['collect']
    assert not capture.offer('zoom','window1')['collect']


def test_migration_and_cascade():
    meeting()
    db=get_db();db.execute('INSERT INTO transcripts(meeting_id,text) VALUES(?,?)',('test','Old transcript'))
    db.execute('INSERT INTO speaker_events(meeting_id,sequence,audio_time,source,participants) VALUES(?,?,?,?,?)',('test',0,0,'meet','[]'));db.commit()
    assert json.loads(db.execute('SELECT speaker_analysis FROM transcripts').fetchone()[0]) == {}
    db.execute('DELETE FROM meetings');db.commit()
    assert db.execute('SELECT COUNT(*) FROM speaker_events').fetchone()[0] == 0
    assert db.execute('SELECT COUNT(*) FROM transcripts').fetchone()[0] == 0


def test_bridge_auth_and_bounds():
    app=FastAPI();app.include_router(bridge_router)
    client=TestClient(app); headers={'X-Speaker-Bridge':BRIDGE_TOKEN}
    assert client.get('/speaker-bridge/state').status_code == 401
    assert client.get('/speaker-bridge/state',headers={**headers,'Origin':'https://meet.google.com'}).status_code == 401
    assert client.get('/speaker-bridge/state',headers=headers).json()['active'] is False
    body=dict(source='meet',target='tab1',session='x'*32,observed_at=1,participants=[{'id':'p1','name':'x'*121}])
    assert client.post('/speaker-bridge/activity',headers=headers,json=body).status_code == 422
    body['participants']=[];body['source']='other'
    assert client.post('/speaker-bridge/activity',headers=headers,json=body).status_code == 422


def test_download_hash_failure_and_cancellation(monkeypatch,tmp_path):
    monkeypatch.setattr(speaker_models,'MODEL_DIR',tmp_path/'models')
    class Response:
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def raise_for_status(self):pass
        def iter_bytes(self,*args):yield b'incorrect model'
    monkeypatch.setattr(speaker_models.httpx,'stream',lambda *a,**k:Response())
    speaker_models._cancel.clear();speaker_models._download()
    assert speaker_models.status()['state'] == 'error' and not speaker_models.ready()
    speaker_models._cancel.set();speaker_models._download()
    assert speaker_models.status()['state'] == 'missing'
    speaker_models._cancel.clear()


def test_retry_rejects_legacy_transcripts():
    meeting();db=get_db();db.execute('INSERT INTO transcripts(meeting_id,text) VALUES(?,?)',('test','Legacy'));db.commit()
    app=FastAPI();app.include_router(router)
    assert TestClient(app).post('/api/speakers/test/retry').status_code == 409


def test_markers_use_saved_audio_clock():
    instance=Recorder();instance._meeting_id='test';instance._captures=[NS(total_frames=80000,samplerate=16000)]
    assert instance.add_marker() == 5


def test_matching_never_uses_titles():
    assert call_key('https://meet.google.com/abc-defg-hij?authuser=1') == 'meet:abc-defg-hij'
    assert call_key('https://example.com/Meeting-with-Maya') is None


def test_unavailable_connection_does_not_supply_names():
    data=events()
    for event in data: event['connection']='unavailable'
    assert speakers.resolve_names([turn()],data)=={}


def test_native_host_rejects_foreign_origins_and_large_frames():
    import subprocess, struct
    host=str(Path(__file__).resolve().parents[2]/'backend/native_host.py')
    denied=subprocess.run([sys.executable,host,'chrome-extension://untrusted/'],input=b'',capture_output=True)
    assert denied.returncode==1 and denied.stdout==b''
    too_big=subprocess.run([sys.executable,host,'chrome-extension://hjifgailamaffpncpidoechbgfpkekjg/'],input=struct.pack('<I',16385),capture_output=True)
    assert too_big.returncode==1 and too_big.stdout==b''


def test_model_readiness_rechecks_corruption(monkeypatch,tmp_path):
    import hashlib
    monkeypatch.setattr(speaker_models,'MODEL_DIR',tmp_path)
    monkeypatch.setattr(speaker_models,'MODEL_HASHES',{'model':hashlib.sha256(b'valid').hexdigest()})
    (tmp_path/'verified').write_text(speaker_models.VERSION)
    (tmp_path/'model').write_bytes(b'valid')
    assert speaker_models.ready()
    (tmp_path/'model').write_bytes(b'wrong')
    assert not speaker_models.ready()


def test_successful_retry_keeps_notes_and_old_fields(monkeypatch):
    meeting();set_setting('speaker_identification',True)
    audio=TRANSCRIPTS_DIR/'synthetic.wav';audio.touch()
    transcript=TRANSCRIPTS_DIR/'test.txt';transcript.write_text('Keep this.')
    db=get_db();db.execute('UPDATE meetings SET audio_path=?,transcript_path=? WHERE id=?',(str(audio),str(transcript),'test'))
    db.execute('INSERT INTO transcripts(meeting_id,text,segments,speaker_analysis,language,duration_sec) VALUES(?,?,?,?,?,?)',('test','Keep this.',json.dumps([{'start':0,'end':1,'text':'Keep this.'}]),json.dumps({'status':'failed','version':speaker_models.VERSION}),'en',1))
    db.execute('INSERT INTO notes(meeting_id,content,generated_at) VALUES(?,?,?)',('test','Existing notes','2026-01-01'));db.commit()
    monkeypatch.setattr(speaker_models,'ready',lambda:True)
    monkeypatch.setattr(speakers,'acoustic_turns',lambda _: [turn()])
    app=FastAPI();app.include_router(router)
    response=TestClient(app).post('/api/speakers/test/retry')
    assert response.json()['status']=='ready'
    row=db.execute('SELECT * FROM transcripts').fetchone()
    assert row['text']=='Speaker 1: Keep this.' and row['language']=='en' and row['duration_sec']==1
    assert transcript.read_text()==row['text']
    assert db.execute('SELECT content FROM notes').fetchone()[0]=='Existing notes'


def test_worker_failure_is_recoverable(monkeypatch):
    import subprocess
    set_setting('speaker_identification',True)
    monkeypatch.setattr(speaker_models,'ready',lambda:True)
    monkeypatch.setattr(speakers.subprocess,'run',lambda *a,**k: (_ for _ in ()).throw(subprocess.CalledProcessError(1,'worker')))
    result=speakers.analyze('test','missing.wav',{'text':'Original','segments':[]})
    assert result['speaker_analysis']['status']=='failed' and result['text']=='Original'
