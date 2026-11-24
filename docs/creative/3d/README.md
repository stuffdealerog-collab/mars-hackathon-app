# 3D: the AI-employee orb constellation

`build_constellation.py` builds the whole scene from code in headless Blender. The interactive Blender MCP add-on is **not** needed, and it was not connected on 24 Nov. The orb colours are the `GRAD` pairs in `src/components/uslub/agents.ts`, so the 3D orbs match the CSS `<Orb/>` in the product.

## Files (`public/media/3d/`)
| File | What | Use |
|---|---|---|
| `constellation-16x9.png` | 1920×1080 hero still | landing hero, slide background, AI-world look reference for Higgsfield |
| `constellation-9x16.png` | 1080×1920 still | Reels/Stories background (space above and below for captions) |
| `constellation-loop.mp4` / `-720p.mp4` | 12 s seamless orbit loop, 24 fps (3.0 MB / 1.2 MB) | film CTA, landing background video (`muted loop playsinline`), demo provider |
| `constellation-push-in.mp4` | 5 s push-in from wide to the lime core | the film's "turn" beat (storyboard beat 11) |
| `clay-push-in.mp4` | the same move as an untextured clay pass | Seedance 2.5 **@Clay Render** reference (camera path and timing) for AI-A1 |
| `orbs/orb-<role>.png` | 11 transparent 1024² orbs (10 employees + core) | compositing in the edit, UI avatars, Higgsfield references |
| `uslub-constellation.glb` | 1.1 MB, vertex-coloured, animated (rotation, bob, pulses) | web 3D. The repo has no three.js yet, so it needs `three` or `@react-three/fiber` (a lead decision) |

## Re-render
```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python docs/creative/3d/build_constellation.py -- public/media/3d hero16x9,hero9x16,orbs,glb final
```
- Modes: `hero16x9`, `hero9x16`, `orbs`, `loop`, `push`, `clay`, `glb`, `blend`.
- The quality argument is `preview` (16 samples), `loop` (48) or `final` (96).
- `loop`, `push` and `clay` write PNG frames. Encode them with:
  ```bash
  ffmpeg -framerate 24 -i <out>/frames/loop_%04d.png -c:v libx264 -crf 22 -pix_fmt yuv420p -movflags +faststart out.mp4
  ```
- Timing on an M4 with EEVEE: a still takes about 6 s, and the 288-frame loop about 6 min.

## Honest assessment
- **Clean and on-brand, but it reads as a 3D render, not as film.** That suits the AI world (the product's own visual language). If a shot needs more organic depth (volumetrics, glass refraction), AI-A1 in the runbook restyles the same camera move through Seedance using the clay pass.
- **No phone or laptop mockup with the Studio UI yet.** It needs final UI screenshots from the deployed app, and screen recordings composited in the edit do the job better for the film.
