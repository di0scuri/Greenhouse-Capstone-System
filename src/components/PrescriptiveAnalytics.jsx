import React, { useState, useEffect } from 'react'
import { openRouterService } from '../server/services/openRouterService'
import './PrescriptiveAnalytics.css'

const PrescriptiveAnalytics = ({ crops, sensorHistory }) => {
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(false)

  const runAnalytics = async () => {
    setLoading(true)
    
    try {
      const result = await openRouterService.getPrescriptiveAnalytics({
        currentCrops: crops,
        sensorHistory: sensorHistory
      })
      
      setAnalytics(result)
    } catch (err) {
      console.error('Analytics failed:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (crops?.length > 0) {
      runAnalytics()
    }
  }, [crops])

  if (loading) {
    return (
      <div className="analytics-loading">
        <div className="spinner"></div>
        <p>Analyzing greenhouse data...</p>
      </div>
    )
  }

  if (!analytics) return null

  return (
    <div className="prescriptive-analytics">
      <h2>AI Prescriptive Analytics</h2>
      
      <div className="health-score">
        <h3>Overall Health Score</h3>
        <div className="score-circle">
          <span className="score-value">{analytics.overallHealthScore}</span>
          <span className="score-max">/10</span>
        </div>
      </div>
      
      {analytics.urgentActions?.length > 0 && (
        <div className="urgent-actions">
          <h3>Urgent Actions Required</h3>
          <div className="actions-list">
            {analytics.urgentActions.map((action, idx) => (
              <div key={idx} className={`action-card priority-${action.priority}`}>
                <div className="action-header">
                  <h4>{action.action}</h4>
                  <span className={`priority-badge ${action.priority}`}>
                    {action.priority}
                  </span>
                </div>
                <p className="action-reason">{action.reason}</p>
                <div className="action-footer">
                  <span className="deadline">⏰ {action.deadline}</span>
                  <span className="affected">
                    Affects: {action.affectedCrops.join(', ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {analytics.predictedIssues?.length > 0 && (
        <div className="predicted-issues">
          <h3>Predicted Issues</h3>
          <div className="issues-grid">
            {analytics.predictedIssues.map((issue, idx) => (
              <div key={idx} className={`issue-card impact-${issue.impact}`}>
                <h4>{issue.issue}</h4>
                <div className="issue-stats">
                  <span className="probability">
                    Probability: {issue.probability}
                  </span>
                  <span className={`impact impact-${issue.impact}`}>
                    Impact: {issue.impact}
                  </span>
                </div>
                <div className="prevention">
                  <strong>Prevention Steps:</strong>
                  <ol>
                    {issue.prevention.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {analytics.resourceOptimization && (
        <div className="resource-optimization">
          <h3>Resource Optimization</h3>
          <div className="resources-grid">
            <div className="resource-card">
              <h4>💧 Water</h4>
              <p>{analytics.resourceOptimization.water}</p>
            </div>
            <div className="resource-card">
              <h4>🌿 Fertilizer</h4>
              <p>{analytics.resourceOptimization.fertilizer}</p>
            </div>
            <div className="resource-card">
              <h4>⚡ Energy</h4>
              <p>{analytics.resourceOptimization.energy}</p>
            </div>
          </div>
        </div>
      )}
      
      {analytics.harvestPredictions?.length > 0 && (
        <div className="harvest-predictions">
          <h3>Harvest Predictions</h3>
          <div className="harvest-table">
            <div className="table-header">
              <div>Crop</div>
              <div>Estimated Date</div>
              <div>Yield</div>
              <div>Quality</div>
            </div>
            {analytics.harvestPredictions.map((pred, idx) => (
              <div key={idx} className="table-row">
                <div className="crop-name">{pred.crop}</div>
                <div className="harvest-date">{pred.estimatedDate}</div>
                <div className="harvest-yield">{pred.estimatedYield}</div>
                <div className={`harvest-quality quality-${pred.quality}`}>
                  {pred.quality}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default PrescriptiveAnalytics