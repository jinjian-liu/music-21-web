# Third-party notices

## Piano samples

The files in `public/samples/piano/` are the A1–A6 piano samples from
[`nbrosowsky/tonejs-instruments`](https://github.com/nbrosowsky/tonejs-instruments).

- Samples license: [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/)
- Attribution: tonejs-instruments contributors and the original sample authors catalogued in the upstream `sample-source-info.txt`
- Files used: `A1.mp3`, `A2.mp3`, `A3.mp3`, `A4.mp3`, `A5.mp3`, `A6.mp3`

The AutoPiano project was studied as an interaction reference only. No AutoPiano
source code or bundled audio sample was copied into this project.

## MIDI parsing

MIDI parsing uses [`@tonejs/midi`](https://github.com/Tonejs/Midi), distributed
under the MIT License. The package converts Standard MIDI files into structured
tracks, notes, tempo events and time-signature events. Its source code is not
copied into this repository.

The lightweight drum sounds are synthesized at runtime with the Web Audio API;
no third-party drum sample files are bundled.
