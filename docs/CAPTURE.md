# Capturing a producer app

The point of an app module is that it looks and behaves like the application it replaces. That
fidelity comes from the application itself, not from memory of it. This is the pass that produces it.

## 1. Get the application

```bash
adb shell pm path <package>                 # every split of the installed app
adb pull <path> ./apk/
jadx --no-res -d src/ apk/base.apk          # sources
jadx --no-src -d res/ apk/base.apk          # decoded resources and layouts
```

Take from the decompiled application, not from a screenshot measured by eye:

- **geometry**: layout XML dimensions, the aspect ratios of the images, paddings
- **animation constants**: durations, spacing of moving elements, easing
- **strings**: the producer's own wording per language, which is what the user recognises
- **colours**: the palette, which goes into the manifest `palette` and nowhere else
- **the click targets**: which element opens which screen, read from the listeners, so the module
  reproduces the navigation rather than inventing one

## 2. Capture the screens

```bash
adb exec-out screencap -p > screen.png
adb shell uiautomator dump /sdcard/ui.xml && adb pull /sdcard/ui.xml
```

Two traps, both met in practice:

- A multi-display foldable makes `screencap` write `[Warning] Multiple displays were found` instead
  of a PNG. Get the display id from `dumpsys SurfaceFlinger --display-id` and pass `-d <id>`.
- A `FLAG_SECURE` window (payment screens, some WebViews) screenshots as solid black. `uiautomator
  dump` still returns the full text and bounds of that screen, so capture the structure that way.

## 3. Map every screen to Home Assistant

For each producer screen, write the row before writing the code: app element, what it does, the
entity or service in Home Assistant that does the same. That table becomes the app's README and it
is what makes the coverage claim checkable. A producer feature with no Home Assistant counterpart
goes into the manifest's `not_covered`, not into a silent gap.

## 4. Verify

- pixel diff the card against the real screenshot: compare the vertical positions of the sections,
  not the whole image. Matching section tops within a few pixels is the standard this project has
  already met once.
- the PoC at 360, 700 and 1000 px card width. One width proves nothing about the others.
- taps checked with real pointer events, never a synthetic `dispatchEvent`, which passes straight
  through an ancestor carrying `pointer-events: none`.
- both `theme: ha` and `theme: app`, on a light and a dark Home Assistant theme.
- a `dry_run: true` pass over every action, reading the logged service calls.

## 5. Never

Do not drive the producer's cloud. An app module reads and writes only through a Home Assistant
integration that the user has already installed. If no such integration exists, the request is for an
integration first, and the app module after it.
