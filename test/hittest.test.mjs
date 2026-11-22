import * as THREE from 'three'

/**
 * Reproduces the scene graph and the hit-resolution walk from App.jsx, then
 * checks every part resolves to the right reaction.
 */
let pass = 0, fail = 0
const t = (n, c, e = '') => { if (c) { pass++; console.log('  ok   ' + n) } else { fail++; console.log('  FAIL ' + n + (e ? ' :: ' + e : '')) } }

// --- build a miniature of the real graph -------------------------------
const root = new THREE.Group(); root.name = 'character-root'
const head = new THREE.Group(); head.name = 'hit-head'
const face = new THREE.Group(); face.name = 'hit-face'
const body = new THREE.Group(); body.name = 'hit-body'
const button = new THREE.Mesh(); button.name = 'hit-button'

const faceSphere = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6))
const eyes = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6))
const hoodMesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6))
const bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6))
const buttonMesh = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6)); buttonMesh.name = 'hit-button'

face.add(faceSphere, eyes)
head.add(face, hoodMesh)
button.add(buttonMesh)
body.add(bodyMesh, button)
root.add(head, body)

// orbs, tagged by index exactly like Orbits.jsx
const orbs = []
for (let i = 0; i < 6; i++) {
  const g = new THREE.Group(); g.userData.orb = i
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6)))
  orbs.push(g)
}

// --- the resolver from App.jsx -----------------------------------------
function resolve(object, parts, orbGroups) {
  let node = object
  while (node && !node.name?.startsWith('hit-')) node = node.parent
  if (node) {
    if (node.name === 'hit-body' || node.name === 'hit-button') return { kind: 'body' }
    if (['hit-face', 'hit-head'].includes(node.name)) return { kind: 'head' }
  }
  let n = object
  while (n && n.userData?.orb === undefined) n = n.parent
  if (n) return { kind: 'orb', orb: n.userData.orb }
  return { kind: 'empty' }
}

console.log('\n== parts resolve to the right reaction ==')
t('hood glass -> head', resolve(hoodMesh, null, orbs).kind === 'head')
t('face sphere -> head', resolve(faceSphere, null, orbs).kind === 'head')
t('eye shell -> head', resolve(eyes, null, orbs).kind === 'head')
t('body -> body', resolve(bodyMesh, null, orbs).kind === 'body')
t('the coral button -> body reaction', resolve(buttonMesh, null, orbs).kind === 'body')
t('orb mesh -> that specific orb', (() => { const r = resolve(orbs[3].children[0], null, orbs); return r.kind === 'orb' && r.orb === 3 })())
t('each orb resolves to its own index', orbs.every((o, i) => resolve(o.children[0], null, orbs).orb === i))
{
  const stray = new THREE.Mesh()
  t('unrelated object -> empty', resolve(stray, null, orbs).kind === 'empty')
}

console.log('\n== the graph really is wired the way the resolver assumes ==')
t('character-root is findable by name', !!root.getObjectByName('character-root'))
t('hit-head is findable by name', !!root.getObjectByName('hit-head'))
t('hit-body is findable by name', !!root.getObjectByName('hit-body'))
t('orbs are discoverable by traverse+userData', (() => {
  const found = []
  root.add(...orbs)
  root.traverse((o) => { if (o.userData?.orb !== undefined) found[o.userData.orb] = o })
  return found.filter(Boolean).length === 6
})())
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
