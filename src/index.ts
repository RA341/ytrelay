import { Hono } from 'hono';
import { exec } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { authMiddleware } from './middleware';

const app = new Hono();

app.use('*', authMiddleware);

app.get('/', (c) => {
  return c.text('Hello Hono!');
});

app.get('/download', async (c) => {
  const videoUrl = c.req.query('url');

  if (!videoUrl) {
    return c.json({ error: 'Missing video URL' }, 400);
  }

  const downloadDir = path.join(process.cwd(), 'downloads');
  const uniqueId = Date.now().toString(); // Simple unique ID
  const outputTemplate = path.join(downloadDir, `${uniqueId}.%(ext)s`);

  try {
    await fs.mkdir(downloadDir, { recursive: true });

    const command = `yt-dlp -o "${outputTemplate}" --restrict-filenames --format best "${videoUrl}"`;
    await new Promise<void>((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error}`);
          return reject(error);
        }
        console.log(`stdout: ${stdout}`);
        console.error(`stderr: ${stderr}`);
        resolve();
      });
    });

    // Find the downloaded file
    const filesInDownloadDir = await fs.readdir(downloadDir);
    const downloadedFile = filesInDownloadDir.find(file => file.startsWith(uniqueId));

    if (!downloadedFile) {
      return c.json({ error: 'Failed to find downloaded file' }, 500);
    }

    const filePath = path.join(downloadDir, downloadedFile);
    const fileContent = await fs.readFile(filePath);

    // Set appropriate headers for file download
    c.header('Content-Disposition', `attachment; filename="${downloadedFile}"`);
    c.header('Content-Type', 'application/octet-stream'); // Generic binary file type

    const response = c.body(fileContent);

    // Defer cleanup to allow the response to be fully sent
    setTimeout(async () => {
      try {
        await fs.unlink(filePath);
        console.log(`Cleaned up: ${filePath}`);
      } catch (cleanupError) {
        console.error(`Error cleaning up file ${filePath}: ${cleanupError}`);
      }
    }, 0);

    return response;

  } catch (error) {
    console.error('Download or file serving error:', error);
    return c.json({ error: 'Failed to download or serve video' }, 500);
  }
});

export default app;