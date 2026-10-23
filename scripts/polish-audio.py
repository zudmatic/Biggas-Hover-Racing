"""Offline mastering. Requires Python + numpy and ffmpeg; never runs in the app.

python3 scripts/polish-audio.py --source INPUT_AUDIO_DIR --output OUTPUT_AUDIO_DIR
The input directory contains scene/manifest.json, scene/*.mp3 and the dance m4a.
Keep an unprocessed input copy: processing is deliberately not cumulative.
"""
import argparse
import json
import pathlib
import subprocess
import shutil
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('--source', type=pathlib.Path, required=True)
parser.add_argument('--output', type=pathlib.Path, required=True)
args = parser.parse_args()
if args.source.resolve() == args.output.resolve():
    parser.error('Source and output must be different directories.')
SR = 44100
scene = args.output / 'scene'
scene.mkdir(parents=True, exist_ok=True)


def read(path):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'])
    return np.frombuffer(raw, dtype='<f4').copy()


def filter_audio(samples, filters):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', 'pipe:0', '-af', filters, '-f', 'f32le', 'pipe:1'], input=samples.astype('<f4').tobytes(), stdout=subprocess.PIPE, check=True).stdout
    return np.frombuffer(raw, dtype='<f4').copy()


def fades(samples, attack=.004, release=.035):
    samples = samples.copy()
    start, end = min(len(samples), int(attack*SR)), min(len(samples), int(release*SR))
    samples[:start] *= np.sin(np.linspace(0, np.pi/2, start))**2
    samples[-end:] *= np.cos(np.linspace(0, np.pi/2, end))**2
    return samples


def level(samples, db, peak=.5, active=False):
    samples = samples - np.mean(samples)
    measure = samples[:min(len(samples), int(.18*SR))] if active else samples
    gain = min(10**(db/20)/max(np.sqrt(np.mean(measure**2)), 1e-8), peak/max(abs(samples)))
    return samples*gain


def encode(name, samples):
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', 'pipe:0', '-c:a', 'libmp3lame', '-b:a', '192k', str(scene/name)], input=samples.astype('<f4').tobytes(), check=True)


def keyboard(source):
    # Cut short key contacts out of the existing foley. Rearrange them into
    # typing bursts, with pauses and different release strengths, not a drone.
    source = filter_audio(source, 'highpass=f=250,lowpass=f=3400')
    energy = np.convolve(source**2, np.ones(220)/220, mode='same')
    remaining = energy.copy()
    contacts = []
    for _ in range(6):
        peak = int(np.argmax(remaining))
        start = max(0, peak-int(.008*SR))
        contact = source[start:start+int(.065*SR)]
        contacts.append(level(fades(contact, .002, .023), -24, .32))
        remaining[max(0, peak-int(.065*SR)):peak+int(.065*SR)] = 0
    rng = np.random.default_rng(817)
    result = np.zeros(10*SR)
    cursor = .06
    while cursor < 9.6:
        for _ in range(int(rng.integers(4, 10))):
            contact = contacts[int(rng.integers(len(contacts)))]
            # Slightly different press/release lengths preserve the dry key sound.
            rate = rng.uniform(.92, 1.08)
            contact = np.interp(np.arange(0, len(contact), rate), np.arange(len(contact)), contact)
            start = int(cursor*SR)
            if start+len(contact) >= len(result):
                break
            result[start:start+len(contact)] += contact*rng.uniform(.65, 1)
            cursor += rng.uniform(.095, .205)
        cursor += rng.uniform(.30, .8)
    result = filter_audio(result, 'acompressor=threshold=0.08:ratio=3:attack=2:release=35:makeup=1')
    return fades(level(result, -27, .42), .008, .08)


manifest = json.loads((args.source/'scene/manifest.json').read_text())
for clip in manifest['clips']:
    name = clip['file']
    if clip.get('preserveMastering'):
        shutil.copy2(args.source/'scene'/name, scene/name)
        continue
    original = read(args.source/'scene'/name)
    if name == 'typing.mp3':
        sound = keyboard(original)
        note = '10-second dry key-contact sequence with irregular bursts and pauses; -27 dB RMS target'
    elif name == 'watering.mp3':
        sound = filter_audio(original, 'highpass=f=180,lowpass=f=4800,afftdn=nf=-32:tn=1')
        overlap = int(.24*SR)
        blend = np.linspace(0, 1, overlap)
        sound = np.r_[sound[overlap:-overlap], sound[-overlap:]*(1-blend)+sound[:overlap]*blend]
        sound = fades(level(sound, -27, .4), .006, .006)
        note = 'Low rumble/hiss reduction; 240 ms overlapping loop seam; -27 dB RMS target'
    elif name.startswith('footstep'):
        carpet = 'carpet' in name
        sound = filter_audio(original, 'highpass=f=85,lowpass=f='+('1100' if carpet else '3600'))
        sound = level(sound, -26 if carpet else -22, .32 if carpet else .48, active=True)
        sound = fades(sound, .003, .045)
        note = 'Matched contact loudness across all four takes; softened high frequencies; carpet stays quieter than wood'
    else:
        settings = {
            'jump-whoosh.mp3': (.23, 350, 3000, -29, .012, .075),
            'jump-land.mp3': (.29, 85, 2600, -25, .003, .09),
            'blinds-cord.mp3': (.72, 320, 3200, -29, .018, .1),
            'blinds-slats.mp3': (.76, 180, 4000, -26, .004, .1),
            'interaction-pop.mp3': (.14, 180, 2200, -32, .003, .04),
            'interaction-chime.mp3': (.24, 700, 3100, -34, .006, .06),
        }
        duration, high, low, db, attack, release = settings[name]
        sound = filter_audio(original, f'highpass=f={high},lowpass=f={low}')
        if name in ['jump-whoosh.mp3', 'jump-land.mp3', 'blinds-cord.mp3', 'blinds-slats.mp3']:
            energy = np.convolve(sound**2, np.ones(220)/220, mode='same')
            onset = max(0, int(np.flatnonzero(energy > energy.max()*.025)[0])-int(.006*SR))
            sound = sound[onset:onset+int(duration*SR)]
        sound = fades(level(sound, db, .48), attack, release)
        sound = np.r_[sound, np.zeros(int(.04*SR))]
        note = f'Dry contact with trimmed noise tail; {high}–{low} Hz band; {db} dB RMS target; smooth attack/release'
    encode(name, sound)
    clip['durationSeconds'] = round(len(sound)/SR, 4)
    clip['mastering'] = note+'; mono 44.1 kHz MP3 192 kbps'
manifest['version'] = 5
(scene/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')

# Preserve the chosen music and timing, while eliminating over-full-scale peaks.
music = args.source/'techno-80-92.m4a'
measurement = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(music), '-af', 'loudnorm=I=-18:TP=-2:LRA=7:print_format=json', '-f', 'null', '-'], stderr=subprocess.PIPE, check=True).stderr.decode()
stats, _ = json.JSONDecoder().raw_decode(measurement[measurement.rfind('{'):])
norm = 'loudnorm=I=-18:TP=-2:LRA=7:linear=true:'+':'.join(f'{key}={stats[value]}' for key,value in [('measured_I','input_i'),('measured_TP','input_tp'),('measured_LRA','input_lra'),('measured_thresh','input_thresh'),('offset','target_offset')])
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(music), '-af', norm+',afade=t=in:d=0.025,afade=t=out:st=11.90:d=0.10', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', str(args.output/'techno-80-92.m4a')], check=True)
print('Mastered 16 scene clips and the existing music passage.')
