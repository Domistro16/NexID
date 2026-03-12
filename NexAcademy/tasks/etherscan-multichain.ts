// tasks/multichain-verify.ts
import { task } from 'hardhat/config'
import type { TaskArguments } from 'hardhat/types'
import { encodeAbiParameters } from 'viem'
import FormData from 'form-data'

const licenseTypes = [
  'None',
  'UNLICENSED',
  'MIT',
  'GPL-2.0',
  'GPL-3.0',
  'LGPL-2.1',
  'LGPL-3.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'MPL-2.0',
  'OSL-3.0',
  'Apache-2.0',
  'AGPL-3.0',
  'BUSL-1.1',
] as const

const getLicenseType = (license: string): number | null => {
  const index = licenseTypes.indexOf(license as (typeof licenseTypes)[number])
  if (index === -1) return null
  return index + 1
}

// simpler, more reliable SPDX extraction
const extractAllLicenses = (source: string): string[] => {

  const regex = /SPDX-License-Identifier:\s*([^\r\n*\/]+)/g // grabs up to linebreak or comment end
  const matches = [...source.matchAll(regex)]
  return matches.map((m) => m[1].trim())
}

const extractOneLicenseFromSourceFile = (source: string): string | null => {
  const licenses = extractAllLicenses(source)
  if (licenses.length === 0) return null
  return licenses[1]
}

type MultichainVerifyTaskArgs = {
  contractName: string
  address: string
  deployArgs?: string
}

function getExplorerConfig(networkName: string) {
  switch (networkName) {
    case 'bsc':
    case 'bscmainnet':
    case 'binance':
      return {
        baseUrl: 'https://api.etherscan.io/v2/api?chainid=56',
        apiKeyEnv: 'BSCSCAN_API_KEY',
      }
    case 'polygon':
    case 'matic':
      return {
        baseUrl: 'https://api.polygonscan.com/api',
        apiKeyEnv: 'POLYGONSCAN_API_KEY',
      }
    case 'avalanche':
    case 'avax':
      return {
        baseUrl: 'https://api.snowtrace.io/api',
        apiKeyEnv: 'SNOWTRACE_API_KEY',
      }
    case 'optimism':
      return {
        baseUrl: 'https://api-optimistic.etherscan.io/api',
        apiKeyEnv: 'OPTIMISM_API_KEY',
      }
    case 'arbitrum':
      return {
        baseUrl: 'https://api.arbiscan.io/api',
        apiKeyEnv: 'ARBITRUM_API_KEY',
      }
    default:
      return {
        baseUrl: 'https://api.etherscan.io/v2/api?chainid=56',
        apiKeyEnv: 'ETHERSCAN_API_KEY',
      }
  }
}

// helper: robust parse for deploy args
function parseDeployArgsArg(raw?: string) {
  if (!raw) return []
  raw = raw.trim()
  // if hex (already ABI-encoded) => return as-is (caller will pass this as hex string)
  if (raw.startsWith('0x')) return raw
  // if JSON (array) => parse and return array
  if (raw.startsWith('[') || raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw)
      return parsed
    } catch (e) {
      throw new Error(
        'Failed to parse deployArgs JSON. Provide a valid JSON array.',
      )
    }
  }
  // otherwise treat as comma-separated list
  // split but trim whitespace; keep empty strings if any
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  return parts
}

// helper: normalize argument types for viem encode (addresses stay strings, numeric strings -> BigInt)
function normalizeArgsForEncoding(argValues: any[]): any[] {
  return argValues.map((v) => {
    if (typeof v === 'string') {
      // hex string: keep
      if (v.startsWith('0x')) return v
      // decimal integer string -> BigInt
      if (/^-?\d+$/.test(v)) {
        // convert to BigInt to be safe
        return BigInt(v)
      }
      // otherwise return string (addresses, etc.)
      return v
    }
    // numbers -> BigInt
    if (typeof v === 'number') return BigInt(v)
    // BigInt -> keep
    if (typeof v === 'bigint') return v
    // arrays/objects -> map recursively (use same rules)
    if (Array.isArray(v)) return normalizeArgsForEncoding(v)
    if (typeof v === 'object' && v !== null) {
      // leave structs/objects as-is (viem accepts nested plain objects matching ABI)
      return v
    }
    return v
  })
}

task(
  'multichain-verify',
  'Verify contract on explorer (Etherscan/BscScan/Polygonscan etc.)',
)
  .addParam(
    'contractName',
    'The artifact contract name (used by hardhat-deploy)',
  )
  .addParam('address', 'Deployed contract address')
  .addOptionalParam(
    'deployArgs',
    'Constructor arguments: JSON array or comma-separated or abi hex (0x...)',
    '',
  )
  .setAction(async (taskArgs: TaskArguments, hre) => {
    const args = taskArgs as unknown as MultichainVerifyTaskArgs
    const {
      contractName: contractName_,
      address,
      deployArgs: deployArgsRaw,
    } = args

    // Use hardhat-deploy's getExtendedArtifact for ABI + metadata
    const extended = await (hre as any).deployments?.getExtendedArtifact(
      contractName_,
    )
    if (!extended)
      throw new Error(
        `Artifact ${contractName_} not found (getExtendedArtifact).`,
      )
    const { metadata: metadataString, abi } = extended
    if (!metadataString)
      throw new Error(
        'Metadata not found in extended artifact. Compile with metadata.',
      )

    const metadata = JSON.parse(metadataString)
    const compilationTarget = metadata.settings?.compilationTarget
    if (!compilationTarget)
      throw new Error(
        "Compilation target not found in metadata. Something's off with compilation.",
      )

    const contractFilepath = Object.keys(compilationTarget)[0]
    const contractName = compilationTarget[contractFilepath]
    if (!contractFilepath || !contractName)
      throw new Error('Contract name or filepath not found in metadata.')

    const fqName = `${contractFilepath}:${contractName}`

    // --- IMPORTANT: use Hardhat buildInfo for exact source content ---
    const buildInfo = await hre.artifacts.getBuildInfo(fqName)
    if (!buildInfo || !buildInfo.input) {
      throw new Error(
        `Build info not found for ${fqName}. Make sure you compiled with Hardhat (npx hardhat compile) and metadata wasn't stripped.`,
      )
    }

    // get real source content (buildInfo.input.sources)
    const buildInput = buildInfo.input
    const sourceObj = buildInput.sources[contractFilepath]
    if (!sourceObj || !sourceObj.content) {
      throw new Error(
        `Source content not found in buildInfo for ${contractFilepath}`,
      )
    }


    // extract license from the actual source content
    const sourceLicenseType = extractOneLicenseFromSourceFile(
      sourceObj.content as string,
    )/* 
    if (!sourceLicenseType)
      throw new Error('License not found in source file (SPDX header).') */
    const licenseType = 'MIT'
    if (!licenseType)
      throw new Error(
        `License '${sourceLicenseType}' not supported by the task.`,
      )

    // build the solidity-standard-json-input to send to the explorer (use literal content from buildInfo)
    const solcInput = {
      language: buildInput.language || metadata.language,
      settings: { ...(buildInput.settings || metadata.settings) },
      sources: {} as Record<string, { content: string }>,
    }

    // Remove compilationTarget if present: explorers expect standard-json without that mapping
    delete solcInput.settings?.compilationTarget

    for (const [p, s] of Object.entries(buildInput.sources)) {
      solcInput.sources[p] = { content: (s as any).content }
    }

    const solcInputString = JSON.stringify(solcInput)

    console.log(
      `Verifying ${fqName} at ${address} on network ${hre.network.name} ...`,
    )

    // constructor encoding
    let constructorArgEncodedHex: string | undefined
    // parse deploy args flexibly
    const parsedDeployArgs = parseDeployArgsArg(deployArgsRaw)
    if (
      typeof parsedDeployArgs === 'string' &&
      parsedDeployArgs.startsWith('0x')
    ) {
      // user provided hex-encoded constructor args already
      constructorArgEncodedHex = parsedDeployArgs
    } else if (Array.isArray(parsedDeployArgs) && parsedDeployArgs.length > 0) {
      // find constructor ABI (if any)
      const constructorAbi = (abi || []).find(
        (x: any) => x.type === 'constructor',
      )
      if (!constructorAbi) {
        throw new Error('No constructor in ABI but deployArgs provided.')
      }
      // normalize values for encoding
      const normalizedValues = normalizeArgsForEncoding(parsedDeployArgs)
      // encode
      try {
        constructorArgEncodedHex = encodeAbiParameters(
          constructorAbi.inputs,
          normalizedValues,
        )
      } catch (e: any) {
        throw new Error(
          `Failed to encode constructor arguments: ${e?.message || String(e)}`,
        )
      }
    }

    // pick explorer base url & api key env var by network name
    const explorer = getExplorerConfig(hre.network.name)
    const apiKey =
      process.env[explorer.apiKeyEnv] || process.env.ETHERSCAN_API_KEY
    if (!apiKey)
      throw new Error(
        `Explorer API key missing. Set env ${explorer.apiKeyEnv} or ETHERSCAN_API_KEY.`,
      )

    const formData = new FormData()
    // Some explorers expect chainId; include it where available
    console.log(solcInputString)
    if ((hre.network as any).config.chainId) {
      formData.append('chainId', (hre.network as any).config.chainId.toString())
    }
    formData.append('contractaddress', address)
    formData.append('sourceCode', solcInputString)
    formData.append('codeformat', 'solidity-standard-json-input')
    // contractName is the fully qualified name used by the compiler: "path:Contract"
    formData.append('contractName', fqName)
    formData.append('compilerversion', `v${metadata.compiler.version}`)
    if (constructorArgEncodedHex) {
      // remove 0x prefix as explorers expect constructor args without it
      formData.append(
        'constructorArguements',
        constructorArgEncodedHex.replace(/^0x/, ''),
      )
    }
    formData.append('licenseType', licenseType.toString())

    const baseUrl = explorer.baseUrl
    const submitUrl = `${baseUrl}&module=contract&action=verifysourcecode&apikey=${apiKey}`

    // node-fetch + form-data: pass headers from formData.getHeaders()
    const headers = (formData as any).getHeaders
      ? (formData as any).getHeaders()
      : undefined

    const response = await fetch(submitUrl, {
      method: 'POST',
      body: formData as any,
      headers,
    })

    const responseData = await response.json()
    if (responseData.status !== '1') {
      throw new Error(`Submission failed: ${JSON.stringify(responseData)}`)
    }

    const guid = responseData.result
    if (!guid) throw new Error('No GUID returned after submission.')

    // poll status
    async function checkStatus() {
      const statusUrl = `${baseUrl}&module=contract&action=checkverifystatus&apikey=${apiKey}&guid=${guid}`
      const r = await fetch(statusUrl)
      const j = await r.json()
      if (j.result === 'Pending in queue') return null
      if (j.status === '1' && j.result !== 'Fail - Unable to verify')
        return 'success'
      throw new Error(`Verification failed: ${JSON.stringify(j)}`)
    }

    console.log('Waiting for verification to complete (polling every 10s)...')
    let result: string | null = null
    while (!result) {
      await new Promise((r) => setTimeout(r, 10_000))
      result = await checkStatus()
    }
    if (result === 'success') {
      console.log(`✅ Verification successful for ${fqName} at ${address}`)
    }
  })
