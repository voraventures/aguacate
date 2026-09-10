"""Offline runtime smoke/benchmark using locally synthesized WAVs, not meetings.

Usage: python tests/backend/speaker_smoke.py /path/to/temporary/artifacts
Requires downloaded pinned assets + voice-a.wav and voice-b.wav in that directory.
"""
import os
import sys
import tempfile
import tarfile
import shutil
import wave
import time
import resource
from pathlib import Path

artifacts=Path(sys.argv[1]).resolve()
os.environ['AGUACATE_DATA_DIR']=tempfile.mkdtemp(prefix='aguacate-speaker-smoke-')
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'backend'))
import numpy as np
from app.config import ensure_dirs
from app.services import speaker_models as models, speakers
ensure_dirs()
for name,_,digest,size in models.ASSETS:
    path=artifacts/name
    assert path.stat().st_size==size and models._digest(path)==digest
class LocalAsset:
    def __init__(self,path):self.path=path
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def raise_for_status(self):pass
    def iter_bytes(self,size):
        with self.path.open('rb') as stream:
            while block:=stream.read(size):yield block
original_stream=models.httpx.stream
models.httpx.stream=lambda method,url,**kwargs:LocalAsset(artifacts/next(a[0] for a in models.ASSETS if a[1]==url))
try:models._download()
finally:models.httpx.stream=original_stream
assert models.ready()
assert (models.MODEL_DIR/'NOTICE.txt').is_file()

def read(name):
    with wave.open(str(artifacts/name)) as wav:
        assert (wav.getframerate(),wav.getnchannels(),wav.getsampwidth())==(16000,1,2)
        return np.frombuffer(wav.readframes(wav.getnframes()),dtype=np.int16)
a,b=read('voice-a.wav'),read('voice-b.wav')
silence=np.zeros(16000*5,dtype=np.int16)
samples=np.concatenate([a,silence,b,silence,a,b])
path=Path(os.environ['AGUACATE_DATA_DIR'])/'synthetic.wav'
with wave.open(str(path),'wb') as wav:
    wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(16000);wav.writeframes(samples.tobytes())
start=time.monotonic();turns=speakers.acoustic_turns(path);elapsed=time.monotonic()-start
duration=len(samples)/16000
print({'audio_seconds':round(duration,2),'processing_seconds':round(elapsed,2),'realtime_factor':round(elapsed/duration,3),'worker_peak_rss_bytes':resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,'speakers':len({t['speaker_id'] for t in turns}),'turns':len(turns)})
assert turns and all(t['end']>t['start'] for t in turns)
da,db=len(a)/16000,len(b)/16000
truth=[(0,da,'a'),(da+5,da+5+db,'b'),(da+db+10,2*da+db+10,'a'),(2*da+db+10,duration,'b')]
events=[]
for stamp in np.arange(0,duration,.25):
    people=[{'id':who,'name':who} for start,end,who in truth if start<=stamp<end]
    events.append({'audio_time':float(stamp),'source':'meet','participants':people})
names=speakers.resolve_names(turns,events)
wrong=covered=0
for turn in turns:
    identity=names.get(turn['speaker_id'],{}).get('name')
    for start,end,who in truth:
        seconds=speakers.overlap(turn['start'],turn['end'],start,end)
        if identity:covered+=seconds;wrong+=seconds*(identity!=who)
print({'synthetic_named_clusters':len(names),'synthetic_named_seconds':round(covered,2),'synthetic_wrong_named_seconds':round(wrong,2)})
for name,data in [('silence',np.zeros(16000*8,dtype=np.int16)),('noise',np.random.default_rng(7).integers(-500,500,16000*8,dtype=np.int16)),('rapid',np.concatenate([a[:24000],b[:24000]]*4)),('overlap',np.clip(a[:80000].astype(np.int32)+b[:80000],-32768,32767).astype(np.int16))]:
    with wave.open(str(path),'wb') as wav:
        wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(16000);wav.writeframes(data.tobytes())
    start=time.monotonic();result=speakers.acoustic_turns(path)
    print({'case':name,'seconds':round(time.monotonic()-start,2),'turns':len(result),'speakers':len({t['speaker_id'] for t in result})})
    assert all(t['end']>t['start'] for t in result)
print('Synthetic runtime smoke passed. This is not a real-call accuracy benchmark.')
