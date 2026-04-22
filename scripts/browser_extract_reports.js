// Paste this into browser DevTools console while logged into an instance
// Run once per instance (nigeria, zambia, ghana, senegal, liberia, sierraleone, demo)

const REPORTS_BY_INSTANCE = {
  "nigeria.fastr-analytics.org": [
    { reportId: "affeb4f2-bf58-40ec-8ffb-58d7f0c2a350", projectId: "4fa64579-1fd1-4e6a-8118-ed83f959da75", label: "Maternal Health Services Brief" },
    { reportId: "89fd71c4-67e6-4ff6-a1f4-7216a16fb2cb", projectId: "4fa64579-1fd1-4e6a-8118-ed83f959da75", label: "State Profiles: JAR" },
    { reportId: "fbaf1935-71d6-48d5-983e-322bfe5fde93", projectId: "5b294a7a-713d-4a37-94e1-d837ee86d8cd", label: "RMNCH Brief" },
    { reportId: "ca2dbaa6-7f8d-4ae9-9aa1-80134d493ac1", projectId: "5b294a7a-713d-4a37-94e1-d837ee86d8cd", label: "Health Facility Data Analysis" },
    { reportId: "affeb4f2-bf58-40ec-8ffb-58d7f0c2a350", projectId: "5ee791cd-4331-44b0-9aa9-fe128a1c2625", label: "Maternal Health Services Brief" },
    { reportId: "89fd71c4-67e6-4ff6-a1f4-7216a16fb2cb", projectId: "5ee791cd-4331-44b0-9aa9-fe128a1c2625", label: "State Profiles: JAR" },
    { reportId: "affeb4f2-bf58-40ec-8ffb-58d7f0c2a350", projectId: "7aff5969-5820-4351-b129-0687787e4e91", label: "Maternal Health Services Brief" },
    { reportId: "89fd71c4-67e6-4ff6-a1f4-7216a16fb2cb", projectId: "7aff5969-5820-4351-b129-0687787e4e91", label: "State Profiles: JAR" },
    { reportId: "affeb4f2-bf58-40ec-8ffb-58d7f0c2a350", projectId: "8de7a5f5-ad30-42f7-af09-eb9aeaff1cda", label: "Maternal Health Services Brief" },
    { reportId: "89fd71c4-67e6-4ff6-a1f4-7216a16fb2cb", projectId: "8de7a5f5-ad30-42f7-af09-eb9aeaff1cda", label: "State Profiles: JAR" },
    { reportId: "affeb4f2-bf58-40ec-8ffb-58d7f0c2a350", projectId: "22f7886c-02b6-4876-9548-146d5102d190", label: "Maternal Health Services Brief" },
    { reportId: "89fd71c4-67e6-4ff6-a1f4-7216a16fb2cb", projectId: "22f7886c-02b6-4876-9548-146d5102d190", label: "State Profiles: JAR" },
    { reportId: "affeb4f2-bf58-40ec-8ffb-58d7f0c2a350", projectId: "33d51f31-22d1-4696-a2f6-0348451361a0", label: "Maternal Health Services Brief" },
    { reportId: "89fd71c4-67e6-4ff6-a1f4-7216a16fb2cb", projectId: "33d51f31-22d1-4696-a2f6-0348451361a0", label: "State Profiles: JAR" },
    { reportId: "affeb4f2-bf58-40ec-8ffb-58d7f0c2a350", projectId: "634a3c19-e879-417c-b9c1-fbac95f8a0b1", label: "Maternal Health Services Brief" },
    { reportId: "89fd71c4-67e6-4ff6-a1f4-7216a16fb2cb", projectId: "634a3c19-e879-417c-b9c1-fbac95f8a0b1", label: "State Profiles: JAR" },
    { reportId: "affeb4f2-bf58-40ec-8ffb-58d7f0c2a350", projectId: "1930c58d-39ee-4f75-9d05-9b8b0c2a2dd2", label: "Maternal Health Services Brief" },
    { reportId: "89fd71c4-67e6-4ff6-a1f4-7216a16fb2cb", projectId: "1930c58d-39ee-4f75-9d05-9b8b0c2a2dd2", label: "State Profiles: JAR" },
    { reportId: "affeb4f2-bf58-40ec-8ffb-58d7f0c2a350", projectId: "4746cd31-a10d-48ff-b8f3-51330158c68f", label: "Maternal Health Services Brief" },
    { reportId: "89fd71c4-67e6-4ff6-a1f4-7216a16fb2cb", projectId: "4746cd31-a10d-48ff-b8f3-51330158c68f", label: "State Profiles: JAR" },
    { reportId: "affeb4f2-bf58-40ec-8ffb-58d7f0c2a350", projectId: "89139724-669e-43fb-acec-d43b73375391", label: "Maternal Health Services Brief" },
    { reportId: "89fd71c4-67e6-4ff6-a1f4-7216a16fb2cb", projectId: "89139724-669e-43fb-acec-d43b73375391", label: "State Profiles: JAR" },
    { reportId: "affeb4f2-bf58-40ec-8ffb-58d7f0c2a350", projectId: "b02ae0dd-e8c1-46b4-a9ed-aa04945ef6bb", label: "Maternal Health Services Brief" },
    { reportId: "89fd71c4-67e6-4ff6-a1f4-7216a16fb2cb", projectId: "b02ae0dd-e8c1-46b4-a9ed-aa04945ef6bb", label: "State Profiles: JAR" },
    { reportId: "affeb4f2-bf58-40ec-8ffb-58d7f0c2a350", projectId: "db86df27-cfce-4127-adf0-cefa9f43569d", label: "Maternal Health Services Brief" },
    { reportId: "89fd71c4-67e6-4ff6-a1f4-7216a16fb2cb", projectId: "db86df27-cfce-4127-adf0-cefa9f43569d", label: "State Profiles: JAR" },
    { reportId: "9173ba36-1500-491b-aba1-3d1d006df740", projectId: "f2c3564d-2212-4a0a-a86a-4c61fcbffaf9", label: "Innovation" },
  ],
  "demo.fastr-analytics.org": [
    { reportId: "5f889936-9b19-482f-9d12-5ec2e9405530", projectId: "8cde6320-99bf-4a8d-a7fd-94d6be8d7eeb", label: "Maternal Health Services Duplicate Report" },
    { reportId: "ec4adc02-5bfb-4f1b-8a7b-cb5689a4ed5e", projectId: "8cde6320-99bf-4a8d-a7fd-94d6be8d7eeb", label: "Maternal Health Services" },
    { reportId: "e7f91da1-8775-47ac-b67b-e76a3ef3c2aa", projectId: "8cde6320-99bf-4a8d-a7fd-94d6be8d7eeb", label: "Q4 Policy brief" },
  ],
  "ghana.fastr-analytics.org": [
    { reportId: "644f8793-dca7-416c-8588-fd8fd543b424", projectId: "3fa982c2-da97-4558-b92f-1a213b8bbcdf", label: "MATERNAL MOTALITY" },
    { reportId: "cfdef7a9-c6b5-4dae-a169-bb2427587226", projectId: "970c85c5-618c-49c7-aab3-770e5163c2a4", label: "Maternal Health Services Brief" },
    { reportId: "52d506a7-bf53-46d4-b536-f3ab3fc71dbf", projectId: "970c85c5-618c-49c7-aab3-770e5163c2a4", label: "POLICY BRIEF" },
    { reportId: "787f8280-6a54-421b-be81-4a57a0def5b0", projectId: "d45c3622-9c63-4cef-af6d-0c6af6419138", label: "FASTR EXPERIENCES FROM WESTERN REGION" },
  ],
  "liberia.fastr-analytics.org": [
    { reportId: "174c8761-bfa5-4dd7-8932-6dbc05ad7531", projectId: "2eb4a13b-d3c2-46c5-9299-7318170a3e22", label: "Disruptions analysis" },
  ],
  "sierraleone.fastr-analytics.org": [
    { reportId: "f1765d98-590b-42cd-9fbb-de6e7eb47ee5", projectId: "e2a3d64b-58ab-4bd9-895e-c2c8f2bc6640", label: "Disruptions analysis" },
  ],
  "senegal.fastr-analytics.org": [
    { reportId: "98fe96b5-f474-4440-b310-152001d90af6", projectId: "bf519b10-dbdb-4633-bf9b-b3b99c44e14b", label: "Test" },
    { reportId: "0b68a1e3-2464-485d-b0fd-af09af70c1b6", projectId: "bf519b10-dbdb-4633-bf9b-b3b99c44e14b", label: "Test" },
  ],
  "zambia.fastr-analytics.org": [
    { reportId: "a8ab5304-1826-4049-8080-8ed38db5a6a2", projectId: "03ac155e-64bd-4ca5-b799-d06a0dfaf369", label: "MK" },
    { reportId: "23f121a4-61cc-4708-94c5-aab574aadccd", projectId: "03ac155e-64bd-4ca5-b799-d06a0dfaf370", label: "Mwango. Immunisation Policy Brief" },
    { reportId: "0c5eae9d-b66e-48aa-bdba-43e3218d585c", projectId: "03ac155e-64bd-4ca5-b799-d06a0dfaf371", label: "Group 3" },
    { reportId: "ee0b18bc-2034-4548-a4fd-88ae77c76965", projectId: "79b7333c-affe-4bb9-aa80-be68b4668b94", label: "Doing More with Less" },
    { reportId: "51d73705-5a21-4fa7-b0f9-c58c7428fad4", projectId: "79b7333c-affe-4bb9-aa80-be68b4668b95", label: "Doing More with Less: Prioritizing Resources" },
    { reportId: "896011b9-f9e2-4012-8b03-9ef5649fe59c", projectId: "79b7333c-affe-4bb9-aa80-be68b4668b96", label: "Monthly bulletin Child Health" },
    { reportId: "2a63b84a-a53c-4c9d-adb4-0215c647b6e8", projectId: "79b7333c-affe-4bb9-aa80-be68b4668b97", label: "Group 1_Policy Brief - Deliveries" },
    { reportId: "5227ec97-9acf-4e92-832b-834b9251e6ce", projectId: "79b7333c-affe-4bb9-aa80-be68b4668b98", label: "Group 3 - Measles" },
  ],
};

(async () => {
  const host = window.location.host;
  const reports = REPORTS_BY_INSTANCE[host];

  if (!reports) {
    console.error(`No reports configured for ${host}`);
    return;
  }

  console.log(`Extracting ${reports.length} reports from ${host}...`);
  const results = [];

  for (const r of reports) {
    console.log(`Fetching: ${r.label}...`);
    try {
      const res = await fetch(`/api/project/${r.projectId}/backup_report/${r.reportId}`);
      const data = await res.json();
      if (data.success) {
        results.push({ ...r, data: data.data });
        console.log(`  ✓ OK`);
      } else {
        console.log(`  ✗ Failed: ${data.err}`);
        results.push({ ...r, error: data.err });
      }
    } catch (e) {
      console.log(`  ✗ Error: ${e}`);
      results.push({ ...r, error: String(e) });
    }
  }

  // Download as JSON
  const blob = new Blob([JSON.stringify(results, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `extracted_reports_${host.split(".")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);

  const succeeded = results.filter(r => r.data).length;
  const failed = results.filter(r => r.error).length;
  console.log(`\nDone! Success: ${succeeded}, Failed: ${failed}`);
})();
