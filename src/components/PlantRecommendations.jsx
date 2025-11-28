import React, { useState, useEffect } from 'react'
import { openRouterService } from '../server/services/openRouterService'
import './PlantRecommendations.css'

const PlantRecommendations = ({ sensorData, greenhouseConfig }) => {
  const [recommendations, setRecommendations] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const getRecommendations = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const result = await openRouterService.getPlantRecommendations({
        soilData: {
          nitrogen: sensorData.nitrogen || 0,
          phosphorus: sensorData.phosphorus || 0,
          potassium: sensorData.potassium || 0,
          ph: sensorData.ph || 7,
          temperature: sensorData.temperature || 25,
          humidity: sensorData.humidity || 60
        },
        season: getCurrentSeason(),
        greenhouseArea: greenhouseConfig.area || 100,
        climate: greenhouseConfig.climate || 'temperate',
        previousCrops: greenhouseConfig.previousCrops || []
      })
      
      setRecommendations(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const getCurrentSeason = () => {
    const month = new Date().getMonth()
    if (month >= 2 && month <= 4) return 'spring'
    if (month >= 5 && month <= 7) return 'summer'
    if (month >= 8 && month <= 10) return 'fall'
    return 'winter'
  }

  return (
    <div className="plant-recommendations">
      <div className="recommendations-header">
        <h2>AI Plant Recommendations</h2>
        <button 
          className="get-recommendations-btn" 
          onClick={getRecommendations} 
          disabled={loading}
        >
          {loading ? 'Analyzing...' : 'Get AI Recommendations'}
        </button>
      </div>
      
      {error && (
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          <span>Error: {error}</span>
        </div>
      )}
      
      {recommendations && !recommendations.error && (
        <div className="recommendations-list">
          <div className="soil-health">
            <h3>Soil Health Score: {recommendations.soilHealthScore}/10</h3>
            {recommendations.criticalIssues?.length > 0 && (
              <div className="critical-issues">
                <h4>Critical Issues:</h4>
                <ul>
                  {recommendations.criticalIssues.map((issue, idx) => (
                    <li key={idx}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          
          <h3>Recommended Plants:</h3>
          <div className="recommendations-grid">
            {recommendations.recommendations?.map((rec, idx) => (
              <div key={idx} className="recommendation-card">
                <div className="rec-header">
                  <h4>{rec.plant}</h4>
                  <span className={`difficulty-badge ${rec.difficulty}`}>
                    {rec.difficulty}
                  </span>
                </div>
                
                <p className="rec-reasoning">{rec.reasoning}</p>
                
                <div className="rec-stats">
                  <div className="stat">
                    <span className="stat-label">Yield</span>
                    <span className="stat-value">{rec.yieldPerSqM} kg/m²</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Growth</span>
                    <span className="stat-value">{rec.growthDuration} days</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Profit</span>
                    <span className="stat-value">{rec.profitMargin}%</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Market</span>
                    <span className={`stat-value demand-${rec.marketDemand}`}>
                      {rec.marketDemand}
                    </span>
                  </div>
                </div>
                
                {rec.soilAmendments?.length > 0 && (
                  <div className="amendments">
                    <strong>Soil Amendments Needed:</strong>
                    <ul>
                      {rec.soilAmendments.map((amendment, i) => (
                        <li key={i}>{amendment}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {recommendations.generalAdvice && (
            <div className="general-advice">
              <h4>General Advice:</h4>
              <p>{recommendations.generalAdvice}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default PlantRecommendations