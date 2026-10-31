from pathlib import Path
import base64
root = Path(__file__).parent
html = (root / 'dist/index.html').read_text()
css = (root / 'dist/style.css').read_text()
svg = base64.b64encode((root / 'dist/assets/mountains.svg').read_bytes()).decode()
css = css.replace("url('assets/mountains.svg')", "url('data:image/svg+xml;base64," + svg + "')")
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + css + '</style>')
html = html.replace('<script src="app.js" defer></script>', '<script>' + (root / 'dist/app.js').read_text() + '</script>')
(root / 'Chakra-Studio-OS.html').write_text(html)

(root / 'index.html').write_text(html)
