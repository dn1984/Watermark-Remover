import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { taskId } = req.query;
  if (!taskId) return res.status(400).json({ error: "taskId is required" });

  try {
    const response = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, {
      headers: {
        Authorization: "Bearer 18f0ad30240e8aa55505bae6215646d5",
      },
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.msg || "Failed to fetch task status");

    res.status(200).json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch task status";
    res.status(500).json({ error: message });
  }
}
