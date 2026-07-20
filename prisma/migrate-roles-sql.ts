import Database from "better-sqlite3";
import path from "node:path";

const dbPath = path.join(process.cwd(), "dev.db");
const db = new Database(dbPath);

const map: Record<string, string> = {
  DeliveryHead: "SVP",
  AccountManager: "VP",
  ProjectLead: "ProjectManager",
  Resource: "Employee",
  Viewer: "Employee",
};

const rows = db.prepare("SELECT id, email, role FROM User").all() as {
  id: string;
  email: string;
  role: string;
}[];

const update = db.prepare("UPDATE User SET role = ? WHERE id = ?");
let updated = 0;
for (const row of rows) {
  const next = map[row.role] ?? row.role;
  if (next !== row.role) {
    update.run(next, row.id);
    updated += 1;
    console.log(`${row.email}: ${row.role} → ${next}`);
  }
}

console.log(`Updated ${updated}/${rows.length} users in ${dbPath}`);
db.close();
