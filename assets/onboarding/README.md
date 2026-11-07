# Introduction artwork

All consumed images are static local `require` imports in `app/welcome.tsx`.
The photo, voice, timeline and collaboration JPGs were already present as local design-handoff crops when this revision started. Their resolution is limited by the supplied screen designs.

`hero_couple_clean.png` replaces the visibly blurred extension in `hero_couple.jpg` for rendering. The older file is retained as source history. The new image was edited using the built-in ImageGen tool from `whole_stories_02_welcome.png` provided by the user. It reconstructs areas under the design's typography; it is not an untouched original photograph. Text, the journey line, buttons and login remain real app controls.

## ImageGen prompt

Edit target: supplied Whole Stories welcome screen. Use case: precise-object-edit. Produce only its clean full-bleed portrait photographic background, same tall 9:20 aspect ratio. Remove ALL lettering, title, colored journey line and dots, button, and login label. Reconstruct the photograph naturally behind those overlays, including the couple's clothing and arms in the lower half; no blurred rectangle, no seams or artificial flat color blocks. Preserve exactly the reference couple, faces, poses, smiling expressions, sunglasses, white shirt, seaside Mediterranean buildings, water and sky and their framing. Keep the sky spacious in the top third for a live logo to be overlaid later, and keep the original warm photographic shading toward the bottom. No text, UI, borders or phone frame. This will be a local background asset for the actual functioning app.

## Verification limits

The web export includes all 11 consumed onboarding images. Desktop browser inspection confirmed the photo and timeline images and Back navigation. It exposed the intrinsic-size background issue, fixed by explicit 100% width and height on hero/splash images. A complete post-fix visual pass at mobile and desktop sizes, voice permissions/playback and real Android/iOS device testing remain required; code/build checks do not establish pixel-perfect parity or native-device behavior.
