import { NextResponse } from "next/server";
import { acpApiError, getAcpProviderOffering } from "@/lib/services/acp/nexmindAcpService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const offering = await getAcpProviderOffering();
    return NextResponse.json({
      provider: {
        id: offering.providerId,
        name: offering.providerName,
        walletAddress: offering.providerWallet,
        status: offering.status
      },
      offerings: [offering]
    });
  } catch (error) {
    const response = acpApiError(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
