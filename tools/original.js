/* Runs the script of the original design (_original/index.original.html) in Node and hands out its data
 * (PRODUCTS, HIGHLIGHTS, RESOURCES ... and the Component class). Used by build-pages.js and seed-content.js. */
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '_original', 'index.original.html'), 'utf8');
const scriptStart = SRC.indexOf('>', SRC.indexOf('data-dc-script')) + 1;
const script = SRC.slice(scriptStart, SRC.lastIndexOf('</script>'));
class DCLogic { constructor() { this.props = {}; } }
const noop = () => { };
const stubs = {
  localStorage: { getItem: () => null, setItem: noop }, window: { addEventListener: noop, removeEventListener: noop, scrollTo: noop, scrollY: 0 },
  requestAnimationFrame: noop, setInterval: noop, clearInterval: noop, FormData: class { get() { return ''; } },
};
const names = ['Component', 'US_STATES', 'CA_PROV', 'MX_STATES', 'HIGHLIGHTS', 'PRODUCTS', 'FILTERS', 'RESOURCES', 'PW_IMGS', 'DL_TYPES', 'F_TYPE'];
module.exports = Object.assign({ SRC, tpl: SRC.slice(SRC.indexOf('<x-dc>') + 6, SRC.indexOf('</x-dc>')) },
  new Function('DCLogic', ...Object.keys(stubs), script + '\nreturn { ' + names.join(', ') + ' };')(DCLogic, ...Object.values(stubs)));
