from pathlib import Path
import base64
root = Path(__file__).parent
html = (root / 'dist/index.html').read_text()
css = (root / 'dist/style.css').read_text()
svg = base64.b64encode((root / 'dist/assets/mountains.svg').read_bytes()).decode()
css = css.replace("url('assets/mountains.svg')", "url('data:image/svg+xml;base64," + svg + "')")
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + css + '</style>')
for script in ['vendor.js', 'app.js', 'enhancements.js']:
    html = html.replace('<script src="' + script + '" defer></script>', '<script>' + (root / ('dist/' + script)).read_text().replace('</script', '<\\/script') + '</script>')
(root / 'Chakra-Studio-OS.html').write_text(html)

(root / 'index.html').write_text(html)
