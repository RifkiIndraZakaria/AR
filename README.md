# WebXR AR Three.js

Aplikasi Augmented Reality berbasis WebXR dan Three.js yang bisa langsung di-host sebagai static site di GitHub Pages.

## Struktur

- `index.html` - markup utama, CDN QR Code, dan import map Three.js.
- `style.css` - tampilan desktop/mobile dan overlay AR.
- `app.js` - logika QR, WebXR hit-test, loader GLB/audio, tap-to-place, pinch scale, dan drag rotate.
- `assets/` - tempat file model dan audio.

## Ganti Asset

Edit dua konstanta paling atas di `app.js`:

```js
const MODEL_PATH = "assets/Kid.glb";
const AUDIO_PATH = "assets/audio.mp3";
```

Pastikan nama file dan huruf besar/kecilnya sama persis. GitHub Pages bersifat case-sensitive.

## Deploy ke GitHub Pages

1. Push folder ini ke repository GitHub.
2. Buka `Settings` -> `Pages`.
3. Pada `Build and deployment`, pilih `Deploy from a branch`.
4. Pilih branch, misalnya `main`, dan folder `/root`.
5. Tunggu URL Pages aktif, biasanya berbentuk `https://username.github.io/nama-repo/`.

WebXR AR membutuhkan HTTPS. GitHub Pages sudah menyediakan HTTPS, jadi gunakan URL Pages saat mencoba di HP.

## Catatan Browser

- AR WebXR paling umum berjalan di Chrome Android pada perangkat yang mendukung ARCore.
- iPhone Safari belum mendukung WebXR immersive AR seperti alur ini.
- Jika audio belum tersedia di `AUDIO_PATH`, aplikasi tetap berjalan tanpa audio.
