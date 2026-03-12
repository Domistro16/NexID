import solc from 'solc'
import fs from 'fs'

const CONTRACT_FILE = 'contracts/ethregistrar/ETHRegistrarController.sol'

const content = fs.readFileSync(CONTRACT_FILE).toString()

const input = {
  language: 'Solidity',
  sources: {
    [CONTRACT_FILE]: {
      content: content,
    },
  },
  settings: {
    outputSelection: {
      '*': {
        '*': ['*'],
      },
    },
  },
}

console.log(JSON.stringify(input))

const output = JSON.parse(solc.compile(JSON.stringify(input)))

for (const contractName in output.contracts[CONTRACT_FILE]) {
  console.log(output.contracts[CONTRACT_FILE][contractName].evm.bytecode.object)
}
