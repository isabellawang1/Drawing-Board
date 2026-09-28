# Drawing Board

Select **Marker**, **Highlighter**, or **Eraser** directly in the
sidebar. Use **Clear All** to start over. You can also use the keyboard: Tab to
the tools, then use the arrow keys to choose one.

- **Marker:** a solid, round line.
- **Highlighter:** a kinda translucent line. 
Command Z and Cmd Shift Z also work. 
Choose black, red, orange, green, blue, or purple from the sidebar color palette.
Use the **Brush width** slider for sizes from 1–50 pixels. Each pen and the eraser
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
  Marker starts at 5 pixels, highlighter at 20, and eraser at 20.
- `web/index.html`: the sidebar and page styling.

After editing either file, refresh the page. No compiler, dependencies, or build
step is needed.
