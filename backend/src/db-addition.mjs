// ADD THIS FUNCTION TO THE BOTTOM OF db.mjs

export async function getDentistApplications() {
  const result = await db.send(new ScanCommand({
    TableName: "moxident-dentist-applications",
  }));
  return result.Items || [];
}
