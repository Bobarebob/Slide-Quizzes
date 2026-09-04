Talking-avatar clips for this slide-quiz:

    retro_intro.mp4     -> played on intro.html
    retro_outro.mp4     -> played on outro.html

Current clips are 1672 x 940 (16:9).

If you re-render at a different size, update the two places in
intro.html and outro.html that name the dimensions:

    <video ... width="1672" height="940">      (the tag itself)
    aspect-ratio: 1672 / 940;                  (in the `video` CSS rule)

Both exist only to reserve the correct box before the file's metadata
loads. The player uses `height: auto`, so the video's own ratio drives
the final height either way -- a stale value causes a brief layout
shift on load, never letterboxing.
