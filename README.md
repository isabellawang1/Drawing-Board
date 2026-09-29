# Drawing Board

Select **Marker**, **Highlighter**, or **Eraser** in the bottom toolbar.
Select **Text** to be able to type somethinng in. 
Click **Shapes** to choose Line, Rectangle, or Circle from the menu above it.
Undo, Redo, and Clear All are in the top bar.

With a keyboard, Tab to a tool and use the arrow keys to switch. Focus Shapes
and press Enter to open its menu, use arrows to choose a shape, then Enter to
confirm. Escape closes the menu.

- **Marker:** a solid, round line.
- **Highlighter:** a kinda translucent line. 
- **Line:** drag from the start to the end of a straight line.
- **Rectangle:** drag between opposite corners to draw an outline.
- **Circle:** drag from its center outward to set the radius.

Shapes preview while you drag. Release to finish, or press Escape to cancel.
They use your selected color and width, and work with Undo, Redo, and Clear All.

Command Z and Cmd Shift Z also work. 
Choose black, red, orange, green, blue, or purple from the bottom color palette.
Use the **Width** slider for sizes from 1–50 pixels. Each drawing tool
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
  Lines, rectangles, and circles start at 5 pixels.
- `web/index.html`: the toolbar, text box, and page styling.

After editing either file, refresh the page. No compiler, dependencies, or build
step is needed.
