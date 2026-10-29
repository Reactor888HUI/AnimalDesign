// Writes the list of files the service worker keeps for offline play into runner/sw.js.
// Run after adding files: node tools/make-sw-list.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), RUN = path.join(ROOT, 'runner');
const walk = (dir, ext) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
  d.isDirectory() ? walk(path.join(dir, d.name), ext) : ext.test(d.name) ? [path.join(dir, d.name)] : []);
function list() {
  return [
  './', 'index.html', 'whippet.html', 'manifest.webmanifest',
  ...walk(path.join(RUN, 'css'), /\.css$/), ...walk(path.join(RUN, 'js'), /\.js$/),
  ...walk(path.join(RUN, 'vendor'), /\.js$/), ...walk(path.join(RUN, 'icons'), /\.png$/),
  ...walk(path.join(ROOT, 'models'), /\.glb$/),
  ].map(f => f.startsWith('/') ? path.relative(RUN, f).split(path.sep).join('/') : f);
}
module.exports = list;
if (require.main === module) {
const files = list();
const sw = path.join(RUN, 'sw.js');
const src = fs.readFileSync(sw, 'utf8').replace(/\/\* FILES \*\/[\s\S]*\/\* \/FILES \*\//,
  '/* FILES */\nconst FILES = [\n' + files.map(f => "  '" + f + "',").join('\n') + '\n];\n/* /FILES */');
fs.writeFileSync(sw, src);
console.log(files.length + ' files');
}
