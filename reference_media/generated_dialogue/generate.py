import json,hashlib,subprocess,sys,time
from pathlib import Path
import numpy as np,onnxruntime as rt,soundfile as sf
from kokoro_onnx import Kokoro
rt.disable_telemetry_events()
root=Path('/workspace/Intruder_Yankee_Station');source=root/'reference_media/generated_dialogue';dest=root/'assets/audio/dialogue'
rows=json.loads(Path('/tmp/intruder-neural-model/script.json').read_text());worker=int(sys.argv[1]);out=[]
opt=rt.SessionOptions();opt.intra_op_num_threads=2;opt.inter_op_num_threads=1
sess=rt.InferenceSession('/tmp/intruder-neural-model/kokoro-v1.0.int8.onnx',sess_options=opt,providers=['CPUExecutionProvider']);k=Kokoro.from_session(sess,'/tmp/intruder-neural-model/voices-v1.0.bin')
for i,row in enumerate(rows):
 if i%2!=worker:continue
 started=time.time();wav=source/(row['id']+'.wav');mp3=dest/(row['id']+'.mp3');speed=1.04 if any(w in row['spoken'].lower() for w in ['eject','get out','go, go','taking fire','hurry','abort']) else 1.0
 if not wav.exists():
  samples,sr=k.create(row['spoken'],voice=row['voice'],speed=speed,lang='en-us');assert len(samples)>sr*.15 and np.isfinite(samples).all();sf.write(wav,samples,sr,subtype='PCM_16')
 else:samples,sr=sf.read(wav)
 subprocess.run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y','-i',str(wav),'-af','loudnorm=I=-19:TP=-2:LRA=8','-ar','24000','-ac','1','-codec:a','libmp3lame','-b:a','64k','-map_metadata','-1',str(mp3)],check=True)
 duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(mp3)]));row.update(file=mp3.name,duration=duration,bytes=mp3.stat().st_size,sha256=hashlib.sha256(mp3.read_bytes()).hexdigest(),sourceWAV='reference_media/generated_dialogue/'+wav.name,sourceSHA256=hashlib.sha256(wav.read_bytes()).hexdigest(),speed=speed,sampleRate=sr)
 out.append(row);Path(f'/tmp/intruder-neural-model/rendered-{worker}.json').write_text(json.dumps(out,indent=2));print(worker,i,row['role'],round(duration,2),round(time.time()-started,2),row['spoken'][:70],flush=True)
