const THREE = require('three');
const geo = new THREE.IcosahedronGeometry(1, 0);
geo.computeVertexNormals();
const pos = geo.attributes.position.array;
const index = geo.index.array;
let normals = [];
for(let i=0; i<index.length; i+=3){
  const vA = new THREE.Vector3(pos[index[i]*3], pos[index[i]*3+1], pos[index[i]*3+2]);
  const vB = new THREE.Vector3(pos[index[i+1]*3], pos[index[i+1]*3+1], pos[index[i+1]*3+2]);
  const vC = new THREE.Vector3(pos[index[i+2]*3], pos[index[i+2]*3+1], pos[index[i+2]*3+2]);
  const center = new THREE.Vector3().add(vA).add(vB).add(vC).divideScalar(3).normalize();
  normals.push(center);
}

// Three.js Icosahedron does not have a face on (0,0,1).
// Let's find the normal closest to (0,0,1) and calculate the rotation to align it perfectly to (0,0,1).
let closest = normals[0];
let maxDot = -1;
normals.forEach(n => { if(n.z > maxDot) { maxDot = n.z; closest = n; } });

// Create alignment quaternion that shifts 'closest' to (0,0,1)
const alignQuat = new THREE.Quaternion().setFromUnitVectors(closest, new THREE.Vector3(0,0,1));

// Spin around Z so that one of the adjacent edges is perfectly horizontal? 
// We will just apply alignQuat.
const rotatedNormals = normals.map(n => n.clone().applyQuaternion(alignQuat));

// Now for each normal, create the quaternion that points it at the camera (0,0,1)
const quats = rotatedNormals.map(n => new THREE.Quaternion().setFromUnitVectors(n, new THREE.Vector3(0,0,1)));

console.log(quats.map(q => `new THREE.Quaternion(${q.x.toFixed(4)}, ${q.y.toFixed(4)}, ${q.z.toFixed(4)}, ${q.w.toFixed(4)})`).join(',\n'));
