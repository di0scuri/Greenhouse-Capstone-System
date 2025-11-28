// server/services/analyticsService.js
import axios from 'axios';
import admin from 'firebase-admin';

// OpenRouter API Configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

console.log('🔑 API Key loaded:', OPENROUTER_API_KEY ? 'Yes ✅' : 'No ❌');
console.log('🔑 API Key length:', OPENROUTER_API_KEY?.length);

const AI_MODEL = 'deepseek/deepseek-chat-v3.1:free';

async function callOpenRouterAPI(prompt, systemPrompt) {
  try {
    const response = await axios.post(
      OPENROUTER_API_URL,
      {
        model: AI_MODEL,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://your-greenhouse-app.com',
          'X-Title': 'Greenhouse Management System'
        }
      }
    );

    return {
      success: true,
      content: response.data.choices[0].message.content,
      model: response.data.model,
      usage: response.data.usage
    };
  } catch (error) {
    console.error('❌ OpenRouter API Error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
}

/**
 * Create event from AI recommendation
 */
async function createAIEvent(db, recommendation, sensorData, plantId = null, metadata = {}) {
  try {
    const eventData = {
      message: recommendation,
      status: 'warning',
      type: 'AI_RECOMMENDATION',
      timestamp: new Date(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      sensorData: {
        Conductivity: sensorData.Conductivity,
        Moisture: sensorData.Moisture,
        Nitrogen: sensorData.Nitrogen,
        Phosphorus: sensorData.Phosphorus,
        Potassium: sensorData.Potassium,
        Temperature: sensorData.Temperature,
        pH: sensorData.pH
      },
      source: 'AI_ANALYSIS',
      // Add additional metadata (analysisType, model, etc.)
      ...metadata
    };

    // If plantId provided, link to specific plant
    if (plantId) {
      eventData.plantId = plantId;
    }

    const docRef = await db.collection('events').add(eventData);
    console.log('✅ AI recommendation saved as event:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Error creating AI event:', error);
    return null;
  }
}

/**
 * Update plant with AI recommendations
 */
async function updatePlantWithAIRecommendations(db, plantId, recommendations, sensorData) {
  try {
    const plantRef = db.collection('plants').doc(plantId);
    
    await plantRef.update({
      aiRecommendations: recommendations,
      lastAIAnalysis: new Date().toISOString(),
      lastSensorData: {
        Conductivity: sensorData.Conductivity,
        Moisture: sensorData.Moisture,
        Nitrogen: sensorData.Nitrogen,
        Phosphorus: sensorData.Phosphorus,
        Potassium: sensorData.Potassium,
        Temperature: sensorData.Temperature,
        pH: sensorData.pH,
        timestamp: sensorData.timestamp
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Plant ${plantId} updated with AI recommendations`);
    return true;
  } catch (error) {
    console.error('❌ Error updating plant with AI recommendations:', error);
    return false;
  }
}

/**
 * Get all active plants to link recommendations
 */
async function getActivePlants(db) {
  try {
    const plantsSnapshot = await db.collection('plants')
      .where('status', 'in', ['Seeding', 'Seedling', 'Growing', 'Flowering', 'Fruiting'])
      .get();

    return plantsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('❌ Error fetching active plants:', error);
    return [];
  }
}

/**
 * Parse AI response into individual recommendations
 */
function parseRecommendations(aiResponse) {
  // Split the response into individual recommendations
  const recommendations = [];
  const lines = aiResponse.split('\n');
  
  let currentRecommendation = '';
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Check if line starts with a number or bullet point
    if (/^[\d\-\*•]/.test(trimmed) && currentRecommendation) {
      recommendations.push(currentRecommendation.trim());
      currentRecommendation = trimmed;
    } else {
      currentRecommendation += ' ' + trimmed;
    }
  }
  
  if (currentRecommendation) {
    recommendations.push(currentRecommendation.trim());
  }

  return recommendations.filter(r => r.length > 20); // Filter out short/empty lines
}

/**
 * Analyze current soil sensor data and provide recommendations
 */
async function analyzeSoilData(sensorData, db, linkToPlants = true) {
  const systemPrompt = `You are an expert agricultural AI assistant specializing in greenhouse management and soil health. 
Your role is to analyze soil sensor data and provide actionable, practical recommendations to farmers.

Focus on:
- Identifying specific problems or risks
- Providing clear, step-by-step actions
- Explaining the "why" behind recommendations
- Prioritizing urgent issues first
- Being specific about quantities, timing, and methods

Keep responses concise but informative. Use bullet points for clarity.`;

  const userPrompt = `Analyze this soil sensor data and provide prescriptive recommendations:

**Current Readings:**
- Conductivity: ${sensorData.Conductivity || 'N/A'}
- Moisture: ${sensorData.Moisture || 'N/A'}%
- Nitrogen (N): ${sensorData.Nitrogen || 'N/A'}
- Phosphorus (P): ${sensorData.Phosphorus || 'N/A'}
- Potassium (K): ${sensorData.Potassium || 'N/A'}
- Temperature: ${sensorData.Temperature || 'N/A'}°C
- pH: ${sensorData.pH || 'N/A'}
- Timestamp: ${sensorData.timestamp || new Date().toISOString()}

**Optimal Ranges (for reference):**
- Conductivity: 20-50
- Moisture: 10-25%
- Nitrogen: 10-25
- Phosphorus: 10-25
- Potassium: 1000-2000
- Temperature: 20-35°C
- pH: 5.5-7.5

Please provide 3-5 concise, actionable recommendations. Format each as a separate point starting with a number.`;

  console.log('🤖 Requesting AI analysis from OpenRouter...');
  const result = await callOpenRouterAPI(userPrompt, systemPrompt);

  if (result.success) {
    console.log('✅ AI analysis completed');
    console.log(`📊 Model used: ${result.model}`);
    console.log(`💰 Tokens used: ${result.usage?.total_tokens || 'N/A'}`);

    // Parse recommendations
    const recommendations = parseRecommendations(result.content);
    console.log(`📋 Parsed ${recommendations.length} recommendations`);

    // Create events for each recommendation
    const eventIds = [];
    for (const recommendation of recommendations) {
      const eventId = await createAIEvent(db, recommendation, sensorData, null, {
        analysisType: 'soil_analysis',
        model: result.model,
        fullAnalysis: result.content
      });
      if (eventId) eventIds.push(eventId);
    }

    // Link to active plants if requested
    if (linkToPlants) {
      const activePlants = await getActivePlants(db);
      console.log(`🌱 Found ${activePlants.length} active plants`);

      for (const plant of activePlants) {
        // Update each plant with AI recommendations
        await updatePlantWithAIRecommendations(db, plant.id, result.content, sensorData);
        
        // Create plant-specific events
        for (const recommendation of recommendations.slice(0, 3)) { // Top 3 for each plant
          await createAIEvent(db, `[${plant.name}] ${recommendation}`, sensorData, plant.id, {
            analysisType: 'soil_analysis',
            model: result.model
          });
        }
      }
    }

    result.eventsCreated = eventIds.length;
    result.plantsUpdated = linkToPlants ? (await getActivePlants(db)).length : 0;
  }

  return result;
}

/**
 * Analyze historical trends and predict future issues
 */
async function analyzeTrends(historicalData, db) {
  const systemPrompt = `You are an expert agricultural data scientist specializing in predictive analytics for greenhouse management.
Analyze historical sensor data patterns to identify trends, predict potential issues, and recommend preventive actions.`;

  const dataPoints = historicalData.map(d => 
    `[${d.timestamp}] Conductivity: ${d.Conductivity}, Moisture: ${d.Moisture}%, N: ${d.Nitrogen}, P: ${d.Phosphorus}, K: ${d.Potassium}, Temp: ${d.Temperature}°C, pH: ${d.pH}`
  ).join('\n');

  const userPrompt = `Analyze these historical soil sensor readings and identify patterns:

${dataPoints}

Provide 3-5 specific predictions and preventive actions. Format each as a separate numbered point.`;

  console.log('🤖 Analyzing historical trends with AI...');
  const result = await callOpenRouterAPI(userPrompt, systemPrompt);

  if (result.success) {
    console.log('✅ Trend analysis completed');
    
    // Create events for predictions
    const predictions = parseRecommendations(result.content);
    for (const prediction of predictions) {
      await createAIEvent(db, `Trend Analysis: ${prediction}`, historicalData[0], null, {
        analysisType: 'trend_analysis',
        model: result.model,
        historicalCount: historicalData.length,
        fullAnalysis: result.content
      });
    }
  }

  return result;
}

/**
 * Get crop-specific recommendations
 */
async function getCropRecommendations(sensorData, cropType, db, plantId = null) {
  const systemPrompt = `You are an expert agronomist specializing in ${cropType} cultivation.
Provide specific, actionable recommendations for growing ${cropType} based on current soil conditions.`;

  const userPrompt = `I'm growing ${cropType} in a greenhouse. Here are my current soil conditions:

- Conductivity: ${sensorData.Conductivity}
- Moisture: ${sensorData.Moisture}%
- Nitrogen: ${sensorData.Nitrogen}
- Phosphorus: ${sensorData.Phosphorus}
- Potassium: ${sensorData.Potassium}
- Temperature: ${sensorData.Temperature}°C
- pH: ${sensorData.pH}

Provide 3-5 specific actions for ${cropType}. Format each as a numbered point.`;

  console.log(`🤖 Getting crop-specific recommendations for ${cropType}...`);
  const result = await callOpenRouterAPI(userPrompt, systemPrompt);

  if (result.success) {
    // Create events
    const recommendations = parseRecommendations(result.content);
    for (const recommendation of recommendations) {
      await createAIEvent(db, `[${cropType}] ${recommendation}`, sensorData, plantId, {
        analysisType: 'crop_recommendations',
        model: result.model,
        cropType: cropType,
        fullAnalysis: result.content
      });
    }

    // Update specific plant if plantId provided
    if (plantId) {
      await updatePlantWithAIRecommendations(db, plantId, result.content, sensorData);
    }
  }

  return result;
}

/**
 * Diagnose problems based on symptoms and sensor data
 */
async function diagnoseProblem(sensorData, symptoms, db, plantId = null) {
  const systemPrompt = `You are an expert plant pathologist and soil scientist.
Diagnose plant health issues by correlating visual symptoms with soil sensor data.
Provide accurate diagnoses and treatment plans.`;

  const userPrompt = `Help diagnose this greenhouse problem:

**Observed Symptoms:**
${symptoms}

**Current Soil Conditions:**
- Conductivity: ${sensorData.Conductivity}
- Moisture: ${sensorData.Moisture}%
- Nitrogen: ${sensorData.Nitrogen}
- Phosphorus: ${sensorData.Phosphorus}
- Potassium: ${sensorData.Potassium}
- Temperature: ${sensorData.Temperature}°C
- pH: ${sensorData.pH}

Provide diagnosis and 3-5 treatment steps. Format as numbered points.`;

  console.log('🤖 Diagnosing problem with AI...');
  const result = await callOpenRouterAPI(userPrompt, systemPrompt);

  if (result.success) {
    // Create urgent event for diagnosis
    await createAIEvent(
      db, 
      `DIAGNOSIS: ${result.content.substring(0, 200)}...`, 
      sensorData, 
      plantId,
      {
        analysisType: 'problem_diagnosis',
        model: result.model,
        symptoms: symptoms,
        fullAnalysis: result.content,
        status: 'urgent'
      }
    );

    // Update plant if specified
    if (plantId) {
      await updatePlantWithAIRecommendations(db, plantId, result.content, sensorData);
    }
  }

  return result;
}

/**
 * Generate comprehensive farm report
 */
async function generateFarmReport(currentData, historicalData, cropInfo, db) {
  const systemPrompt = `You are an agricultural consultant creating comprehensive farm reports.
Analyze all available data and create a detailed, professional report with actionable insights.`;

  const userPrompt = `Create a comprehensive greenhouse management report:

**Current Status:**
- Conductivity: ${currentData.Conductivity}
- Moisture: ${currentData.Moisture}%
- NPK: ${currentData.Nitrogen}/${currentData.Phosphorus}/${currentData.Potassium}
- Temperature: ${currentData.Temperature}°C
- pH: ${currentData.pH}

**Crops:** ${cropInfo || 'Various vegetables'}
**Historical Data Points:** ${historicalData.length}

Provide an executive summary with 5 key action items. Format as numbered points.`;

  console.log('🤖 Generating comprehensive farm report...');
  const result = await callOpenRouterAPI(userPrompt, systemPrompt);

  if (result.success) {
    // Create summary event
    await createAIEvent(db, `Farm Report Generated: ${result.content.substring(0, 200)}...`, currentData, null, {
      analysisType: 'farm_report',
      model: result.model,
      cropInfo: cropInfo,
      historicalCount: historicalData.length,
      fullAnalysis: result.content
    });
  }

  return result;
}

export default {
  analyzeSoilData,
  analyzeTrends,
  getCropRecommendations,
  diagnoseProblem,
  generateFarmReport,
  callOpenRouterAPI,
  createAIEvent,
  updatePlantWithAIRecommendations
};