# Dance excerpt

`techno-80-92.m4a` contains the requested 1:20–1:32 excerpt (12 seconds) of **ZAPRAVKA — TECHNO (VIP)**.

Source supplied by the user: https://www.youtube.com/watch?v=Z4Oujizv7ig

The player serves this excerpt locally through HTML audio. No YouTube iframe or third-party player is loaded.

Mastered at approximately −18 LUFS integrated, with a −2 dBTP ceiling, 25 ms entrance and 100 ms exit fades. The original excerpt and timing are preserved. The measured final true peak is −4.44 dBTP.

## Daytime forest ambience

`scene/day-forest.wav` uses [Sonido Ambiente de bosque — Variedad de sonidos](https://www.youtube.com/watch?v=NqKqUKqULRw), supplied by the user. The 14.768-second decoded source becomes a 13.268-second loop with a 1.5-second equal-power overlap between its tail and head. Stereo PCM16 WAV, 44.1 kHz, 60 Hz high-pass, DC removal and peak-limited level matching. WAV avoids encoder padding at the wrap. Playback follows daylight and the scene's sound toggle; the fixed channel levels are defined in `src/audio-channels.js`.

## Nighttime forest ambience

`scene/night-forest.wav` uses [Sonidos Del Bosque De Noche — El Bosque Trails, Tours & Eco-Lodge](https://www.youtube.com/watch?v=t-QnTGSfMxc), supplied by the user. The decoded 15.186-second source becomes a 13.686-second loop with a 1.5-second equal-power tail/head overlap. Stereo PCM16 WAV, 44.1 kHz, 60 Hz high-pass, DC removal, −28 dB RMS. It fades in as daylight fades out; blinds and music attenuate it, and its mixer volume/mute are independent of the daytime track.
