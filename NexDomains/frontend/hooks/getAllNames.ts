import { gql, useQuery } from '@apollo/client'
import { useState, useEffect, useRef } from 'react'

const UNWRAPPED_QUERY = gql`
  query UnwrappedByOwner($owner: String!, $first: Int!, $skip: Int!) {
    domains(
      where: { owner: $owner, name_ends_with: ".id" }
      first: $first
      skip: $skip
      orderBy: name
      orderDirection: asc
    ) {
      name
      expiryDate
      createdAt
    }
  }
`

const WRAPPED_QUERY = gql`
  query WrappedByOwner($owner: String!, $first: Int!, $skip: Int!) {
    wrappedDomains(
      where: { owner: $owner, name_ends_with: ".id" }
      first: $first
      skip: $skip
      orderBy: name
      orderDirection: asc
    ) {
      name
      expiryDate
    }
  }
`
function usePaged(
  query: any,
  owner: string,
  setter: React.Dispatch<React.SetStateAction<any[]>>,
  rootField: 'domains' | 'wrappedDomains',
) {
  const pageSize = 200
  const skipRef = useRef(0)
  const { data, fetchMore, loading } = useQuery<any>(query, {
    variables: { owner, first: pageSize, skip: skipRef.current },
    skip: !owner,
  })

  useEffect(() => {
    const items = data?.[rootField] as
      | Array<{ name: string; expiryDate: string; createdAt: string }>
      | undefined
    if (!items) return

    setter((prev) => [...prev, ...items])

    if (items.length === pageSize) {
      skipRef.current += pageSize
      fetchMore({ variables: { skip: skipRef.current } })
    }

  }, [data, fetchMore, setter, rootField])

  return loading
}

export function useAllOwnedNames(owner: string | undefined) {
  const [unwrapped, setUnwrapped] = useState<any[]>([])
  const [wrapped, setWrapped] = useState<any[]>([])
  const safeOwner = owner?.toLowerCase() ?? ''
  const loadingWrapped = usePaged(WRAPPED_QUERY, safeOwner, setWrapped, 'wrappedDomains')
  const loadingUnwrapped = usePaged(UNWRAPPED_QUERY, safeOwner, setUnwrapped, 'domains')

  // merge and dedupe by name
  const all = [...unwrapped, ...wrapped]
  const unique = Array.from(new Map(all.map((d) => [d.name, d])).values())
  return {
    domains: unique,
    isLoading: loadingWrapped || loadingUnwrapped,
  }
}
