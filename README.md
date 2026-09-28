# Drawing Board

Select **Marker** to draw, **Eraser** to erase, or **Clear All** to start over.
Choose black, red, orange, green, blue, or purple from the sidebar color palette.
Use the **Brush width** slider for sizes from 1–50 pixels. Marker and Eraser each
remember their own size while the page is open.
Use a mouse, finger, or stylus. Drawings stay in memory until you refresh or close
the page.

## Open the website

Open `web/index.html` directly in your browser, or run a local server:

```sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory web
```

Visit http://localhost:8080. If the server is already running, just refresh.

## The code

- `web/app.js`: marker drawing, erasing, and clearing in plain JavaScript.
  Marker starts at 5 pixels; eraser starts at 20 pixels. Both sizes are adjustable.
- `web/index.html`: the sidebar and page styling.

After editing either file, refresh the page. No compiler, dependencies, or build
step is needed.
