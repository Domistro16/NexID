interface PriceDisplayProps {
  currency: 'BNB' | 'USD'
  price: { bnb: string; usd: string; usd1: string; cake: string }
  estimateBnb: string
  estimateUsd: string
  loading: boolean
  estimateLoading: boolean
  duration: { years: number; months: number; days: number }
  date: boolean
  years: number
  lifetime?: boolean
}

const PriceDisplay = ({
  currency,
  price,
  estimateBnb,
  estimateUsd,
  loading,
  estimateLoading,
  duration,
  date,
  years,
  lifetime = false,
}: PriceDisplayProps) => {
  const renderDuration = () => {
    if (date) {
      return (
        <div className="text-sm flex font-semibold text-gray-400 grow-1">
          {lifetime
            ? 'Lifetime'
            : `${years} year${years > 1 ? 's' : ''}`}{' '}
          registration
        </div>
      )
    } else {
      return (
        <div className="text-sm flex font-semibold text-gray-400 grow-1">
          {duration.years > 0
            ? ` ${duration.years} year${duration.years > 1 ? 's' : ''}`
            : ''}
          {duration.months > 0
            ? `${duration.years > 0 ? ',' : ''} ${duration.months} months`
            : ''}
          {duration.days > 0
            ? `${duration.months > 0 ? ',' : ''} ${duration.days} days`
            : ''}{' '}
          registration.
        </div>
      )
    }
  }

  return (
    <div className="rounded-xl bg-neutral-900 px-5 py-5 mt-5">
      {currency === 'BNB' ? (
        <div className="space-y-1">
          <div className="flex">
            {renderDuration()}
            {loading ? (
              <div className="animate-pulse">
                <div className="animate-pulse w-20 h-6 rounded-full bg-gradient-to-r from-gray-800 via-gray-700 to-gray-800" />
              </div>
            ) : (
              <div className="text-gray-400">{price.bnb} BNB</div>
            )}
          </div>
          <div className="flex">
            <div className="text-sm flex font-semibold text-gray-400 grow-1">
              Estimated Gas Fee
            </div>
            {estimateLoading || estimateBnb === 'NaN' ? (
              <div className="animate-pulse">
                <div className="animate-pulse w-20 h-6 rounded-full bg-gradient-to-r from-gray-800 via-gray-700 to-gray-800" />
              </div>
            ) : (
              <div className="text-gray-400">{estimateBnb} BNB</div>
            )}
          </div>
          <div className="flex">
            <div className="text-sm flex font-semibold text-white grow-1">
              Estimated Total
            </div>
            {loading || estimateLoading || estimateBnb === 'NaN' ? (
              <div className="animate-pulse">
                <div className="animate-pulse w-20 h-6 rounded-full bg-gradient-to-r from-gray-800 via-gray-700 to-gray-800" />
              </div>
            ) : (
              <div className="text-white">
                {(Number(estimateBnb) + Number(price.bnb)).toFixed(4)} BNB
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex">
            {renderDuration()}
            {loading ? (
              <div className="animate-pulse">
                <div className="animate-pulse w-20 h-6 rounded-full bg-gradient-to-r from-gray-800 via-gray-700 to-gray-800" />
              </div>
            ) : (
              <div className="text-gray-400">${price.usd}</div>
            )}
          </div>
          <div className="flex">
            <div className="text-sm flex font-semibold text-gray-400 grow-1">
              Estimated Gas Fee
            </div>
            {estimateLoading || estimateUsd === 'NaN' ? (
              <div className="animate-pulse">
                <div className="animate-pulse w-20 h-6 rounded-full bg-gradient-to-r from-gray-800 via-gray-700 to-gray-800" />
              </div>
            ) : (
              <div className="text-gray-400">${estimateUsd}</div>
            )}
          </div>
          <div className="flex">
            <div className="text-sm flex font-semibold text-white grow-1">
              Estimated Total
            </div>
            {loading || estimateLoading || estimateUsd === 'NaN' ? (
              <div className="animate-pulse">
                <div className="animate-pulse w-20 h-6 rounded-full bg-gradient-to-r from-gray-800 via-gray-700 to-gray-800" />
              </div>
            ) : (
              <div className="text-white">
                ${(Number(estimateUsd) + Number(price.usd)).toFixed(2)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default PriceDisplay
