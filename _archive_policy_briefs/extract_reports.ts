// Run with: deno run --allow-net --allow-write scripts/extract_reports.ts

const REPORTS = [
  {
    reportId: "affeb4f2-bf58-40ec-8ffb-58d7f0c2a350",
    label: "Maternal Health Services Brief",
    instance: "nigeria",
    projectId: "4fa64579-1fd1-4e6a-8118-ed83f959da75",
  },
  {
    reportId: "89fd71c4-67e6-4ff6-a1f4-7216a16fb2cb",
    label: "State Profiles: JAR",
    instance: "nigeria",
    projectId: "4fa64579-1fd1-4e6a-8118-ed83f959da75",
  },
  {
    reportId: "fbaf1935-71d6-48d5-983e-322bfe5fde93",
    label: "RMNCH Brief",
    instance: "nigeria",
    projectId: "5b294a7a-713d-4a37-94e1-d837ee86d8cd",
  },
  {
    reportId: "ca2dbaa6-7f8d-4ae9-9aa1-80134d493ac1",
    label: "Health Facility Data Analysis (2020-2025)",
    instance: "nigeria",
    projectId: "5b294a7a-713d-4a37-94e1-d837ee86d8cd",
  },
  {
    reportId: "affeb4f2-bf58-40ec-8ffb-58d7f0c2a350",
    label: "Maternal Health Services Brief",
    instance: "nigeria",
    projectId: "5ee791cd-4331-44b0-9aa9-fe128a1c2625",
  },
  {
    reportId: "89fd71c4-67e6-4ff6-a1f4-7216a16fb2cb",
    label: "State Profiles: JAR",
    instance: "nigeria",
    projectId: "5ee791cd-4331-44b0-9aa9-fe128a1c2625",
  },
  {
    reportId: "affeb4f2-bf58-40ec-8ffb-58d7f0c2a350",
    label: "Maternal Health Services Brief",
    instance: "nigeria",
    projectId: "7aff5969-5820-4351-b129-0687787e4e91",
  },
  {
    reportId: "89fd71c4-67e6-4ff6-a1f4-7216a16fb2cb",
    label: "State Profiles: JAR",
    instance: "nigeria",
    projectId: "7aff5969-5820-4351-b129-0687787e4e91",
  },
  {
    reportId: "affeb4f2-bf58-40ec-8ffb-58d7f0c2a350",
    label: "Maternal Health Services Brief",
    instance: "nigeria",
    projectId: "8de7a5f5-ad30-42f7-af09-eb9aeaff1cda",
  },
  {
    reportId: "89fd71c4-67e6-4ff6-a1f4-7216a16fb2cb",
    label: "State Profiles: JAR",
    instance: "nigeria",
    projectId: "8de7a5f5-ad30-42f7-af09-eb9aeaff1cda",
  },
  {
    reportId: "affeb4f2-bf58-40ec-8ffb-58d7f0c2a350",
    label: "Maternal Health Services Brief",
    instance: "nigeria",
    projectId: "22f7886c-02b6-4876-9548-146d5102d190",
  },
  {
    reportId: "89fd71c4-67e6-4ff6-a1f4-7216a16fb2cb",
    label: "State Profiles: JAR",
    instance: "nigeria",
    projectId: "22f7886c-02b6-4876-9548-146d5102d190",
  },
  {
    reportId: "affeb4f2-bf58-40ec-8ffb-58d7f0c2a350",
    label: "Maternal Health Services Brief",
    instance: "nigeria",
    projectId: "33d51f31-22d1-4696-a2f6-0348451361a0",
  },
  {
    reportId: "89fd71c4-67e6-4ff6-a1f4-7216a16fb2cb",
    label: "State Profiles: JAR",
    instance: "nigeria",
    projectId: "33d51f31-22d1-4696-a2f6-0348451361a0",
  },
  {
    reportId: "affeb4f2-bf58-40ec-8ffb-58d7f0c2a350",
    label: "Maternal Health Services Brief",
    instance: "nigeria",
    projectId: "634a3c19-e879-417c-b9c1-fbac95f8a0b1",
  },
  {
    reportId: "89fd71c4-67e6-4ff6-a1f4-7216a16fb2cb",
    label: "State Profiles: JAR",
    instance: "nigeria",
    projectId: "634a3c19-e879-417c-b9c1-fbac95f8a0b1",
  },
  {
    reportId: "affeb4f2-bf58-40ec-8ffb-58d7f0c2a350",
    label: "Maternal Health Services Brief",
    instance: "nigeria",
    projectId: "1930c58d-39ee-4f75-9d05-9b8b0c2a2dd2",
  },
  {
    reportId: "89fd71c4-67e6-4ff6-a1f4-7216a16fb2cb",
    label: "State Profiles: JAR",
    instance: "nigeria",
    projectId: "1930c58d-39ee-4f75-9d05-9b8b0c2a2dd2",
  },
  {
    reportId: "affeb4f2-bf58-40ec-8ffb-58d7f0c2a350",
    label: "Maternal Health Services Brief",
    instance: "nigeria",
    projectId: "4746cd31-a10d-48ff-b8f3-51330158c68f",
  },
  {
    reportId: "89fd71c4-67e6-4ff6-a1f4-7216a16fb2cb",
    label: "State Profiles: JAR",
    instance: "nigeria",
    projectId: "4746cd31-a10d-48ff-b8f3-51330158c68f",
  },
  {
    reportId: "affeb4f2-bf58-40ec-8ffb-58d7f0c2a350",
    label: "Maternal Health Services Brief",
    instance: "nigeria",
    projectId: "89139724-669e-43fb-acec-d43b73375391",
  },
  {
    reportId: "89fd71c4-67e6-4ff6-a1f4-7216a16fb2cb",
    label: "State Profiles: JAR",
    instance: "nigeria",
    projectId: "89139724-669e-43fb-acec-d43b73375391",
  },
  {
    reportId: "affeb4f2-bf58-40ec-8ffb-58d7f0c2a350",
    label: "Maternal Health Services Brief",
    instance: "nigeria",
    projectId: "b02ae0dd-e8c1-46b4-a9ed-aa04945ef6bb",
  },
  {
    reportId: "89fd71c4-67e6-4ff6-a1f4-7216a16fb2cb",
    label: "State Profiles: JAR",
    instance: "nigeria",
    projectId: "b02ae0dd-e8c1-46b4-a9ed-aa04945ef6bb",
  },
  {
    reportId: "affeb4f2-bf58-40ec-8ffb-58d7f0c2a350",
    label: "Maternal Health Services Brief",
    instance: "nigeria",
    projectId: "db86df27-cfce-4127-adf0-cefa9f43569d",
  },
  {
    reportId: "89fd71c4-67e6-4ff6-a1f4-7216a16fb2cb",
    label: "State Profiles: JAR",
    instance: "nigeria",
    projectId: "db86df27-cfce-4127-adf0-cefa9f43569d",
  },
  {
    reportId: "9173ba36-1500-491b-aba1-3d1d006df740",
    label: "Innovation",
    instance: "nigeria",
    projectId: "f2c3564d-2212-4a0a-a86a-4c61fcbffaf9",
  },
  {
    reportId: "5f889936-9b19-482f-9d12-5ec2e9405530",
    label: "Maternal Health Services Duplicate Report",
    instance: "demonstration site",
    projectId: "8cde6320-99bf-4a8d-a7fd-94d6be8d7eeb",
  },
  {
    reportId: "ec4adc02-5bfb-4f1b-8a7b-cb5689a4ed5e",
    label: "Maternal Health Services",
    instance: "demonstration site",
    projectId: "8cde6320-99bf-4a8d-a7fd-94d6be8d7eeb",
  },
  {
    reportId: "e7f91da1-8775-47ac-b67b-e76a3ef3c2aa",
    label: "Q4 Policy brief",
    instance: "demonstration site",
    projectId: "8cde6320-99bf-4a8d-a7fd-94d6be8d7eeb",
  },
  {
    reportId: "644f8793-dca7-416c-8588-fd8fd543b424",
    label: "MATERNAL MOTALITY",
    instance: "ghana",
    projectId: "3fa982c2-da97-4558-b92f-1a213b8bbcdf",
  },
  {
    reportId: "cfdef7a9-c6b5-4dae-a169-bb2427587226",
    label: "Maternal Health Services Brief",
    instance: "ghana",
    projectId: "970c85c5-618c-49c7-aab3-770e5163c2a4",
  },
  {
    reportId: "52d506a7-bf53-46d4-b536-f3ab3fc71dbf",
    label: "POLICY BRIEF",
    instance: "ghana",
    projectId: "970c85c5-618c-49c7-aab3-770e5163c2a4",
  },
  {
    reportId: "787f8280-6a54-421b-be81-4a57a0def5b0",
    label: "FASTR EXPERIENCES FROM WESTERN REGION",
    instance: "ghana",
    projectId: "d45c3622-9c63-4cef-af6d-0c6af6419138",
  },
  {
    reportId: "174c8761-bfa5-4dd7-8932-6dbc05ad7531",
    label: "Disruptions analysis",
    instance: "liberia",
    projectId: "2eb4a13b-d3c2-46c5-9299-7318170a3e22",
  },
  {
    reportId: "f1765d98-590b-42cd-9fbb-de6e7eb47ee5",
    label: "Disruptions analysis",
    instance: "sierraleone",
    projectId: "e2a3d64b-58ab-4bd9-895e-c2c8f2bc6640",
  },
  {
    reportId: "98fe96b5-f474-4440-b310-152001d90af6",
    label: "Test",
    instance: "senegal",
    projectId: "bf519b10-dbdb-4633-bf9b-b3b99c44e14b",
  },
  {
    reportId: "0b68a1e3-2464-485d-b0fd-af09af70c1b6",
    label: "Test",
    instance: "senegal",
    projectId: "bf519b10-dbdb-4633-bf9b-b3b99c44e14b",
  },
  {
    reportId: "a8ab5304-1826-4049-8080-8ed38db5a6a2",
    label: "MK",
    instance: "zambia",
    projectId: "03ac155e-64bd-4ca5-b799-d06a0dfaf369",
  },
  {
    reportId: "23f121a4-61cc-4708-94c5-aab574aadccd",
    label: "Mwango. Immunisation Policy Brief",
    instance: "zambia",
    projectId: "03ac155e-64bd-4ca5-b799-d06a0dfaf370",
  },
  {
    reportId: "0c5eae9d-b66e-48aa-bdba-43e3218d585c",
    label: "Group 3",
    instance: "zambia",
    projectId: "03ac155e-64bd-4ca5-b799-d06a0dfaf371",
  },
  {
    reportId: "ee0b18bc-2034-4548-a4fd-88ae77c76965",
    label: "Doing More with Less",
    instance: "zambia",
    projectId: "79b7333c-affe-4bb9-aa80-be68b4668b94",
  },
  {
    reportId: "51d73705-5a21-4fa7-b0f9-c58c7428fad4",
    label: "Doing More with Less: Prioritizing Resources...",
    instance: "zambia",
    projectId: "79b7333c-affe-4bb9-aa80-be68b4668b95",
  },
  {
    reportId: "896011b9-f9e2-4012-8b03-9ef5649fe59c",
    label: "Monthly bulletin Child Health",
    instance: "zambia",
    projectId: "79b7333c-affe-4bb9-aa80-be68b4668b96",
  },
  {
    reportId: "2a63b84a-a53c-4c9d-adb4-0215c647b6e8",
    label: "Group 1_Policy Brief - Deliveries",
    instance: "zambia",
    projectId: "79b7333c-affe-4bb9-aa80-be68b4668b97",
  },
  {
    reportId: "5227ec97-9acf-4e92-832b-834b9251e6ce",
    label: "Group 3 - Measles",
    instance: "zambia",
    projectId: "79b7333c-affe-4bb9-aa80-be68b4668b98",
  },
];

// Map instance names to base URLs
const BASE_URLS: Record<string, string> = {
  nigeria: "https://nigeria.fastr-analytics.org",
  zambia: "https://zambia.fastr-analytics.org",
  ghana: "https://ghana.fastr-analytics.org",
  senegal: "https://senegal.fastr-analytics.org",
  liberia: "https://liberia.fastr-analytics.org",
  sierraleone: "https://sierraleone.fastr-analytics.org",
  "demonstration site": "https://demo.fastr-analytics.org",
};

async function extractReport(
  reportId: string,
  instance: string,
  projectId: string,
  label: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const baseUrl = BASE_URLS[instance];
  if (!baseUrl) {
    console.error(`Unknown instance: ${instance}`);
    return { success: false, error: `Unknown instance: ${instance}` };
  }

  const url = `${baseUrl}/temp_backup/${projectId}/${reportId}`;
  console.log(`Fetching: ${label} from ${instance}`);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      console.error(`  Failed: ${res.status} ${res.statusText}`);
      return { success: false, error: `${res.status}: ${text}` };
    }
    const data = await res.json();
    return data;
  } catch (err) {
    console.error(`  Error:`, err);
    return { success: false, error: String(err) };
  }
}

async function main() {
  const outputDir = "./extracted_reports";
  await Deno.mkdir(outputDir, { recursive: true });

  const results: {
    report: (typeof REPORTS)[0];
    success: boolean;
    error?: string;
  }[] = [];

  for (const report of REPORTS) {
    const data = await extractReport(
      report.reportId,
      report.instance,
      report.projectId,
      report.label,
    );

    if (data.success && data.data) {
      const safeLabel = report.label
        .replace(/[^a-zA-Z0-9]/g, "_")
        .substring(0, 50);
      const filename = `${outputDir}/${report.instance}_${safeLabel}_${report.reportId}.json`;
      await Deno.writeTextFile(filename, JSON.stringify(data.data, null, 2));
      console.log(`  Saved: ${filename}`);
      results.push({ report, success: true });
    } else {
      results.push({ report, success: false, error: data.error });
    }
  }

  // Summary
  console.log("\n--- Summary ---");
  const succeeded = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  console.log(`Succeeded: ${succeeded.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log("\nFailed reports:");
    for (const f of failed) {
      console.log(`  - ${f.report.label} (${f.report.instance}): ${f.error}`);
    }
  }
}

main();
