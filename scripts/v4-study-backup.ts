import { backupStudies, restoreStudies } from "../src/v4science/backup";
const [action, source, destination] = process.argv.slice(2);
if (!source || !destination || !["backup", "restore"].includes(action))
  throw new Error(
    "Usage : tsx scripts/v4-study-backup.ts backup|restore /source/absolue /destination/nouvelle",
  );
if (action === "backup") await backupStudies(source, destination);
else restoreStudies(source, destination);
console.log(`V4 ${action} terminée vers ${destination}`);
