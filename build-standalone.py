from pathlib import Path
root = Path(__file__).parent
html = (root / 'dist/index.html').read_text(encoding='utf-8')
css = (root / 'dist/style.css').read_text(encoding='utf-8')
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + css + '</style>')
for script in ['vendor.js', 'app.js', 'workspace-ui.js', 'charts.js', 'delivery.js', 'sharing.js', 'enhancements.js']:
    html = html.replace('<script src="' + script + '" defer></script>', '<script>' + (root / ('dist/' + script)).read_text(encoding='utf-8').replace('</script', '<\\/script') + '</script>')
(root / 'Chakra-Studio-OS.html').write_text(html, encoding='utf-8')

(root / 'index.html').write_text(html, encoding='utf-8')
