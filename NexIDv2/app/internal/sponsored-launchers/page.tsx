import { InternalAdminPage, InternalCommandPanel } from "@/components/internal-admin-page";
import { InternalSponsoredLaunchersClient } from "@/components/internal-sponsored-launchers-client";
import { DEFAULT_NEXMARKETS_CHAIN_ID } from "@/config/nexmarkets-contracts";
import { getSponsoredLauncherAdminSummary } from "@/lib/services/sponsoredLauncherAdminService";

export const dynamic = "force-dynamic";

export default async function InternalSponsoredLaunchersPage() {
  const chainId = Number(process.env.NEXT_PUBLIC_NATIVE_MARKETS_CHAIN_ID || DEFAULT_NEXMARKETS_CHAIN_ID);
  const summary = await getSponsoredLauncherAdminSummary({ chainId }).catch(() => null);
  return (
    <InternalAdminPage
      title="Sponsored Launchers"
      eyebrow="Bond-free creator allowances"
      deck="Grant selected creator wallets a fixed number of sponsored native market launches. These markets bypass the bond, remain non-Genesis, and keep the normal creator-fee economics."
      stats={[
        { label: "Network", value: summary?.network ?? "Base", note: `Chain ${summary?.chainId ?? chainId}` },
        { label: "Factory", value: summary?.factoryAddress ? "Configured" : "Missing", note: summary?.factoryAddress ?? "No sponsored factory" },
        { label: "Signing mode", value: "Wallet", note: "Admin signs in browser" },
        { label: "Factory admin", value: "Wallet checked", note: "Connected wallet must hold DEFAULT_ADMIN_ROLE" }
      ]}
    >
      <InternalCommandPanel
        title="Set sponsored launch allowance"
        description="Set the total sponsored launch allowance for each wallet. Use 20 for the current trader incentive room."
        defaultOpen
      >
        <InternalSponsoredLaunchersClient defaultChainId={chainId} defaultAllowance={20} />
      </InternalCommandPanel>
    </InternalAdminPage>
  );
}
