export async function handleHealthCheck(): Promise<Response> {
    return Response.json({ status: "ok", timestamp: new Date().toISOString() });
}
