import { mkdir, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, 'dist');
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js']) {
  await copyFile(join(root, file), join(output, file));
}
console.log(`Frontend copied to ${output}`);
