import {readFileSync,writeFileSync} from 'node:fs';
let html=readFileSync('dist/index.html','utf8').replace('<link rel="stylesheet" href="style.css">','<style>'+readFileSync('dist/style.css','utf8')+'</style>');
for(const script of ['vendor.js','app.js','workspace-ui.js','charts.js','delivery.js','sharing.js','enhancements.js'])html=html.replace('<script src="'+script+'" defer></script>',()=>'<script>'+readFileSync('dist/'+script,'utf8').replace(/<\/script/gi,'<\\/script')+'</script>');
for(const file of ['index.html','Chakra-Studio-OS.html'])writeFileSync(file,html);
