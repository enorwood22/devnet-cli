import fs from "fs";
import https from "https";
import path from "path";
import { spawn } from "child_process";
import chalk from "chalk";
import { CLI_VERSION } from "../version.js";

const REPO = "enorwood22/devnet-cli";

function getPlatformAsset(): string | null {
  const { platform, arch } = process;
  if (platform === "win32") return "devnet-win.exe";
  if (platform === "darwin") return arch === "arm64" ? "devnet-macos-arm64" : "devnet-macos-x64";
  if (platform === "linux") return arch === "arm64" ? "devnet-linux-arm64" : "devnet-linux-x64";
  return null;
}

function httpsGet(url: string): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "devnet-cli" } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpsGet(res.headers.location).then(resolve, reject);
        return;
      }
      let body = "";
      res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers as Record<string, string | string[] | undefined>, body }));
    }).on("error", reject);
  });
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    function follow(u: string) {
      https.get(u, { headers: { "User-Agent": "devnet-cli" } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          follow(res.headers.location);
          return;
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
        file.on("error", reject);
      }).on("error", reject);
    }
    follow(url);
  });
}

function semverGt(a: string, b: string): boolean {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number);
  const [aMaj, aMin, aPatch] = parse(a);
  const [bMaj, bMin, bPatch] = parse(b);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPatch > bPatch;
}

export async function updateCommand(): Promise<void> {
  process.stdout.write("  Checking for updates...");

  let latestTag: string;
  let downloadUrl: string;

  try {
    const res = await httpsGet(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (res.status !== 200) {
      process.stdout.write("\n");
      console.error(chalk.red("  Could not reach GitHub releases API."));
      return;
    }
    const release = JSON.parse(res.body) as { tag_name: string; assets: { name: string; browser_download_url: string }[] };
    latestTag = release.tag_name;

    if (!semverGt(latestTag, CLI_VERSION)) {
      process.stdout.write("\n");
      console.log(chalk.green(`  Already up to date (${CLI_VERSION}).`));
      return;
    }

    const assetName = getPlatformAsset();
    if (!assetName) {
      process.stdout.write("\n");
      console.error(chalk.red(`  Unsupported platform: ${process.platform}/${process.arch}`));
      return;
    }

    const asset = release.assets.find((a) => a.name === assetName);
    if (!asset) {
      process.stdout.write("\n");
      console.error(chalk.red(`  No binary found for ${assetName} in release ${latestTag}.`));
      return;
    }

    downloadUrl = asset.browser_download_url;
  } catch (err) {
    process.stdout.write("\n");
    console.error(chalk.red(`  Failed to check for updates: ${(err as Error).message}`));
    return;
  }

  process.stdout.write(chalk.gray(" ok\n"));
  process.stdout.write(`  Downloading ${latestTag!}...`);

  const execPath = process.execPath;
  const tmpPath = execPath + ".update";

  try {
    await downloadFile(downloadUrl!, tmpPath);
    fs.chmodSync(tmpPath, 0o755);

    if (process.platform === "win32") {
      // Windows locks running executables, so we can't replace ourselves directly.
      // Write a bat file that waits for us to exit (releasing the lock), then moves
      // the new binary into place. We launch it detached and immediately exit so
      // the move succeeds without any manual step from the user.
      const bat = path.join(path.dirname(execPath), "_devnet_update.bat");
      const batContent = [
        "@echo off",
        "timeout /t 2 /nobreak >nul",
        `move /y "${tmpPath}" "${execPath}"`,
        `del "${bat}"`,
      ].join("\r\n");
      fs.writeFileSync(bat, batContent);

      const child = spawn("cmd.exe", ["/c", bat], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.unref(); // don't keep our process alive waiting for cmd.exe

      process.stdout.write("\n");
      console.log(chalk.green(`  Updated to ${latestTag!}. Run devnet again to use the new version.`));
      process.exit(0);
    } else {
      fs.renameSync(tmpPath, execPath);
      process.stdout.write("\n");
      console.log(chalk.green(`  Updated to ${latestTag!}. Restart devnet to use the new version.`));
    }
  } catch (err) {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    process.stdout.write("\n");
    console.error(chalk.red(`  Update failed: ${(err as Error).message}`));
    if ((err as NodeJS.ErrnoException).code === "EACCES") {
      console.error(chalk.yellow("  Try running as Administrator."));
    }
  }
}
