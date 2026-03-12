import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers'
import { expect } from 'chai'
import hre from 'hardhat'

async function fixture() {
  const stringUtils = await hre.viem.deployContract('StringUtilsTest', [])

  return { stringUtils }
}

describe('StringUtils', () => {
  it('should escape double quote correctly based on JSON standard', async () => {
    const { stringUtils } = await loadFixture(fixture)

    await expect(
      stringUtils.read.testEscape(['My ENS is, "tanrikulu.id"']),
    ).resolves.toEqual('My ENS is, \\"tanrikulu.id\\"')
  })

  it('should escape backslash correctly based on JSON standard', async () => {
    const { stringUtils } = await loadFixture(fixture)

    await expect(
      stringUtils.read.testEscape(['Path\\to\\file']),
    ).resolves.toEqual('Path\\\\to\\\\file')
  })

  it('should escape new line character correctly based on JSON standard', async () => {
    const { stringUtils } = await loadFixture(fixture)

    await expect(
      stringUtils.read.testEscape(['Line 1\nLine 2']),
    ).resolves.toEqual('Line 1\\nLine 2')
  })
})
