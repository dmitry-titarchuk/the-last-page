// update() may resolve before the new worker finishes caching all assets.
export async function checkForUpdate(registration) {
  await registration.update();
  if (registration.waiting) return registration.waiting;
  const installing = registration.installing;
  if (!installing) return null;
  return new Promise((resolve, reject) => {
    const changed = () => {
      if (installing.state === 'installed') {
        installing.removeEventListener('statechange', changed);
        resolve(registration.waiting);
      } else if (installing.state === 'redundant') {
        installing.removeEventListener('statechange', changed);
        reject(new Error('Update installation failed'));
      }
    };
    installing.addEventListener('statechange', changed);
    changed();
  });
}
