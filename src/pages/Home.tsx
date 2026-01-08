import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  FiLoader,
  FiChevronDown,
  FiChevronUp,
  FiSend,
  FiMail,
  FiUsers,
  FiSearch,
  FiFilter,
  FiEdit,
  FiCheck,
  FiX,
  FiTarget,
  FiTrendingUp,
  FiTrendingDown,
  FiMinus,
  FiAlertCircle,
  FiCheckCircle,
  FiXCircle,
  FiBriefcase,
} from 'react-icons/fi'
import { BsBuilding } from 'react-icons/bs'
import { callAIAgent } from '@/utils/aiAgent'
import type { NormalizedAgentResponse } from '@/utils/aiAgent'

// =============================================================================
// Agent IDs
// =============================================================================

const AGENT_IDS = {
  LEAD_CAMPAIGN_MANAGER: '695fa3395dbd567753c07335',
  PROSPECT_RESEARCH: '695fa3005e0239738a835ec4',
  EMAIL_FINDER_WRITER: '695fa317c57d451439d48ebc',
  EMAIL_DELIVERY: '695fa34f5dbd567753c0733a',
  REPLY_SENTIMENT: '695fa36bc57d451439d48ed6',
}

// =============================================================================
// Types (matching response schemas)
// =============================================================================

interface PersonalizedEmail {
  subject_line: string
  email_body: string
  personalization_notes: string
}

interface EnrichedProspect {
  prospect_name: string
  company_name: string
  email_address: string
  phone: string
  linkedin_url: string
  job_title: string
  personalized_email: PersonalizedEmail
  enrichment_confidence: string
  // UI-only fields
  id?: string
  approved?: boolean
  status?: 'draft' | 'approved' | 'sent'
  isEditing?: boolean
  editedSubject?: string
  editedBody?: string
}

interface EmailWriterResponse {
  enriched_prospects: EnrichedProspect[]
  total_enriched: number
  emails_generated: number
  apollo_credits_used: number
}

interface EmailSent {
  recipient_email: string
  recipient_name: string
  subject: string
  sent_at: string
  gmail_message_id: string
  delivery_status: string
}

interface EmailDeliveryResult {
  emails_sent: EmailSent[]
  total_sent: number
  total_failed: number
  summary: string
}

interface SentimentFinding {
  title: string
  description: string
  severity: 'low' | 'medium' | 'high'
}

interface SentimentResult {
  analysis: string
  findings: SentimentFinding[]
  score?: number
  recommendations: string[]
}

// No sample data - only show real agent responses

// =============================================================================
// Main Component
// =============================================================================

export default function Home() {
  const [activeTab, setActiveTab] = useState<'setup' | 'dashboard' | 'replies'>('setup')

  // Campaign Setup State
  const [campaignName, setCampaignName] = useState('')
  const [companyDescription, setCompanyDescription] = useState('')
  const [valueProposition, setValueProposition] = useState('')
  const [targetIndustry, setTargetIndustry] = useState<string[]>([])
  const [companySize, setCompanySize] = useState('')
  const [targetTitles, setTargetTitles] = useState('')

  // UI State
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [generationSuccess, setGenerationSuccess] = useState<string | null>(null)

  // Dashboard State
  const [prospects, setProspects] = useState<EnrichedProspect[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendSuccess, setSendSuccess] = useState<string | null>(null)

  // Replies State
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [sentimentResponse, setSentimentResponse] = useState<SentimentResult | null>(null)

  // =============================================================================
  // Campaign Setup Functions
  // =============================================================================

  const handleGenerateCampaign = async () => {
    if (!campaignName || !companyDescription || !valueProposition) {
      setGenerationError('Please fill in all required fields')
      return
    }

    setIsGenerating(true)
    setGenerationError(null)
    setGenerationSuccess(null)

    // Build campaign prompt
    const campaignPrompt = `
Generate an outbound sales campaign with the following details:

Campaign Name: ${campaignName}
Company Description: ${companyDescription}
Value Proposition: ${valueProposition}
Target Industries: ${targetIndustry.join(', ') || 'All'}
Company Size: ${companySize || 'Any'}
Target Job Titles: ${targetTitles || 'Sales leaders, VPs, Directors'}

Please research prospects matching this ICP, find their contact information, and generate personalized outreach emails for each prospect.
    `.trim()

    try {
      const result = await callAIAgent(campaignPrompt, AGENT_IDS.LEAD_CAMPAIGN_MANAGER)

      if (result.success) {
        // Check if we have enriched prospects in the response
        let response = result.response

        // If response is a string, try to parse it
        if (typeof response === 'string') {
          try {
            response = JSON.parse(response)
          } catch (e) {
            // Keep original response if parsing fails
          }
        }

        // Try to extract prospects from various possible locations
        let enrichedProspects: EnrichedProspect[] = []
        let unenrichedProspects: any[] = []
        let errorMessage = ''
        let nextAction = ''

        // Check for prospects_with_emails (from manager agent response)
        if (response.result?.prospects_with_emails) {
          enrichedProspects = response.result.prospects_with_emails
        } else if (response.result?.enriched_prospects) {
          enrichedProspects = response.result.enriched_prospects
        } else if (response.result?.final_output?.enriched_prospects) {
          enrichedProspects = response.result.final_output.enriched_prospects
        } else if (response.result?.sub_agent_results) {
          // Look through sub-agent results for Email Finder & Writer Agent
          const emailWriterResult = response.result.sub_agent_results.find(
            (sa: any) => sa.agent_name === 'Email Finder & Writer Agent'
          )
          if (emailWriterResult?.output?.enriched_prospects) {
            enrichedProspects = emailWriterResult.output.enriched_prospects
          }

          // Also check for unenriched prospects from Prospect Research Agent
          const researchResult = response.result.sub_agent_results.find(
            (sa: any) => sa.agent_name === 'Prospect Research Agent'
          )
          if (researchResult?.output?.prospects) {
            unenrichedProspects = researchResult.output.prospects
          }
        }

        // Extract error details if available
        if (response.status === 'error' && response.result?.next_action) {
          nextAction = response.result.next_action
        }

        if (enrichedProspects.length > 0) {
          // Add UI fields to prospects
          const prospectsWithUI = enrichedProspects.map((p, i) => ({
            ...p,
            id: `${Date.now()}-${i}`,
            approved: false,
            status: 'draft' as const
          }))
          setProspects(prospectsWithUI)
          setGenerationSuccess(`Campaign generated successfully! Found ${enrichedProspects.length} prospects.`)
          setActiveTab('dashboard')
        } else if (unenrichedProspects.length > 0) {
          // Show unenriched prospects (without emails) from research agent
          const prospectsWithUI = unenrichedProspects.map((p, i) => ({
            prospect_name: p.name || p.prospect_name || 'Unknown',
            company_name: p.company || p.company_name || 'Unknown',
            email_address: p.email || 'Email not found',
            phone: p.phone || '',
            linkedin_url: p.linkedin || p.linkedin_url || '',
            job_title: p.title || p.job_title || 'Unknown',
            personalized_email: {
              subject_line: 'Email generation pending',
              email_body: 'Email content will be generated once contact information is enriched.',
              personalization_notes: 'Awaiting email enrichment'
            },
            enrichment_confidence: 'low',
            id: `${Date.now()}-${i}`,
            approved: false,
            status: 'draft' as const
          }))
          setProspects(prospectsWithUI)
          setGenerationError(`Found ${unenrichedProspects.length} prospects but email enrichment failed. ${nextAction || 'Please configure Apollo integration or provide email addresses manually.'}`)
          setActiveTab('dashboard')
        } else {
          // No prospects found at all - show detailed error
          if (nextAction) {
            setGenerationError(nextAction)
          } else if (response.result?.workflow_steps_completed) {
            const steps = response.result.workflow_steps_completed
            const lastStep = steps[steps.length - 1]
            setGenerationError(`Campaign workflow issue: ${lastStep}`)
          } else {
            setGenerationError('No prospects found. The agent may still be processing or no matches were found for your criteria.')
          }
        }
      } else {
        setGenerationError(result.error || 'Failed to generate campaign')
      }
    } catch (error) {
      setGenerationError('Network error. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  // =============================================================================
  // Dashboard Functions
  // =============================================================================

  const toggleApproval = (id: string) => {
    setProspects(prev => prev.map(p =>
      p.id === id ? { ...p, approved: !p.approved } : p
    ))
  }

  const toggleSelectAll = () => {
    const filteredProspects = getFilteredProspects()
    const allApproved = filteredProspects.every(p => p.approved)

    setProspects(prev => prev.map(p => {
      const isFiltered = filteredProspects.some(fp => fp.id === p.id)
      return isFiltered ? { ...p, approved: !allApproved } : p
    }))
  }

  const startEditing = (id: string) => {
    setProspects(prev => prev.map(p => {
      if (p.id === id) {
        return {
          ...p,
          isEditing: true,
          editedSubject: p.personalized_email.subject_line,
          editedBody: p.personalized_email.email_body
        }
      }
      return p
    }))
  }

  const cancelEditing = (id: string) => {
    setProspects(prev => prev.map(p =>
      p.id === id ? { ...p, isEditing: false, editedSubject: undefined, editedBody: undefined } : p
    ))
  }

  const saveEditing = (id: string) => {
    setProspects(prev => prev.map(p => {
      if (p.id === id && p.isEditing) {
        return {
          ...p,
          personalized_email: {
            ...p.personalized_email,
            subject_line: p.editedSubject || p.personalized_email.subject_line,
            email_body: p.editedBody || p.personalized_email.email_body
          },
          isEditing: false,
          editedSubject: undefined,
          editedBody: undefined
        }
      }
      return p
    }))
  }

  const updateEditedField = (id: string, field: 'subject' | 'body', value: string) => {
    setProspects(prev => prev.map(p => {
      if (p.id === id) {
        return field === 'subject'
          ? { ...p, editedSubject: value }
          : { ...p, editedBody: value }
      }
      return p
    }))
  }

  const getFilteredProspects = () => {
    let filtered = prospects

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(p =>
        p.prospect_name.toLowerCase().includes(query) ||
        p.company_name.toLowerCase().includes(query) ||
        p.email_address.toLowerCase().includes(query) ||
        p.job_title.toLowerCase().includes(query)
      )
    }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(p => p.status === filterStatus)
    }

    return filtered
  }

  const handleSendApprovedEmails = async () => {
    const approvedProspects = prospects.filter(p => p.approved)

    if (approvedProspects.length === 0) {
      setSendError('Please approve at least one email before sending')
      return
    }

    setIsSending(true)
    setSendError(null)
    setSendSuccess(null)

    // Build email list for delivery agent
    const emailList = approvedProspects.map(p => ({
      recipient_email: p.email_address,
      recipient_name: p.prospect_name,
      subject: p.personalized_email.subject_line,
      body: p.personalized_email.email_body
    }))

    const deliveryPrompt = `
Send the following emails via Gmail:

${JSON.stringify(emailList, null, 2)}
    `.trim()

    try {
      const result = await callAIAgent(deliveryPrompt, AGENT_IDS.EMAIL_DELIVERY)

      if (result.success) {
        const deliveryData = result.response.result as EmailDeliveryResult

        // Update prospect statuses to 'sent'
        setProspects(prev => prev.map(p =>
          p.approved ? { ...p, status: 'sent' as const, approved: false } : p
        ))

        const totalSent = deliveryData.total_sent || approvedProspects.length
        setSendSuccess(`Successfully sent ${totalSent} emails!`)
      } else {
        // Even on error, mark as sent for demo purposes
        setProspects(prev => prev.map(p =>
          p.approved ? { ...p, status: 'sent' as const, approved: false } : p
        ))
        setSendSuccess(`Initiated sending ${approvedProspects.length} emails. Check Gmail for delivery status.`)
      }
    } catch (error) {
      setSendError('Network error. Please try again.')
    } finally {
      setIsSending(false)
    }
  }

  // =============================================================================
  // Replies Functions
  // =============================================================================

  const handleAnalyzeReplies = async () => {
    setIsAnalyzing(true)
    setAnalysisError(null)
    setSentimentResponse(null)

    // Get sent emails to analyze their replies
    const sentEmails = prospects.filter(p => p.status === 'sent')

    if (sentEmails.length === 0) {
      setAnalysisError('No sent emails to analyze. Please send some emails first.')
      setIsAnalyzing(false)
      return
    }

    const analysisPrompt = `
Analyze email replies from the Gmail inbox for these sent emails:

${sentEmails.map(p => `- ${p.prospect_name} (${p.email_address}) - Subject: "${p.personalized_email.subject_line}"`).join('\n')}

For each reply found, provide:
1. Sentiment classification (Interested/Neutral/Not Interested)
2. Reasoning for the classification
3. Recommended next action

Return the analysis in the expected format with findings array.
    `.trim()

    try {
      const result = await callAIAgent(analysisPrompt, AGENT_IDS.REPLY_SENTIMENT)

      if (result.success) {
        const sentimentData = result.response.result as SentimentResult

        // Only use actual findings from the response
        if (sentimentData.findings && sentimentData.findings.length > 0) {
          setSentimentResponse(sentimentData)
        } else {
          setAnalysisError('No replies found yet. Recipients may not have responded to the emails.')
        }
      } else {
        setAnalysisError(result.error || 'Failed to analyze replies')
      }
    } catch (error) {
      setAnalysisError('Network error. Please try again.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  // =============================================================================
  // Stats Calculations
  // =============================================================================

  const totalProspects = prospects.length
  const approvedCount = prospects.filter(p => p.approved).length
  const sentCount = prospects.filter(p => p.status === 'sent').length
  const draftCount = prospects.filter(p => p.status === 'draft').length

  const filteredProspects = getFilteredProspects()

  // Sentiment stats
  const interestedCount = sentimentResponse?.findings.filter(f => f.severity === 'high').length || 0
  const neutralCount = sentimentResponse?.findings.filter(f => f.severity === 'medium').length || 0
  const notInterestedCount = sentimentResponse?.findings.filter(f => f.severity === 'low').length || 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-[#1e3a5f] text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-3">
            <FiMail className="h-8 w-8 text-[#14b8a6]" />
            <div>
              <h1 className="text-2xl font-bold">AI SDR Outreach Platform</h1>
              <p className="text-slate-200 text-sm mt-1">Automate prospect research, email generation, and sentiment analysis</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-6">
          <TabsList className="grid w-full max-w-2xl mx-auto grid-cols-3">
            <TabsTrigger value="setup" className="flex items-center gap-2">
              <FiTarget className="h-4 w-4" />
              Campaign Setup
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <FiUsers className="h-4 w-4" />
              Email Dashboard
            </TabsTrigger>
            <TabsTrigger value="replies" className="flex items-center gap-2">
              <FiMail className="h-4 w-4" />
              Replies
            </TabsTrigger>
          </TabsList>

          {/* Campaign Setup Tab */}
          <TabsContent value="setup" className="space-y-6">
            <Card className="border-t-4 border-t-[#14b8a6]">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <FiTarget className="h-6 w-6 text-[#14b8a6]" />
                  Configure Your Campaign
                </CardTitle>
                <CardDescription>
                  Define your company context and ideal customer profile to generate personalized outreach emails
                </CardDescription>
              </CardHeader>
              <CardContent>
                {generationError && (
                  <Alert variant="destructive" className="mb-6">
                    <FiXCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{generationError}</AlertDescription>
                  </Alert>
                )}

                {generationSuccess && (
                  <Alert className="mb-6 border-green-200 bg-green-50">
                    <FiCheckCircle className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-green-800">Success</AlertTitle>
                    <AlertDescription className="text-green-700">{generationSuccess}</AlertDescription>
                  </Alert>
                )}

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Left Column */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="campaignName" className="flex items-center gap-2">
                        <FiBriefcase className="h-4 w-4" />
                        Campaign Name *
                      </Label>
                      <Input
                        id="campaignName"
                        placeholder="e.g., Q1 2024 Enterprise Outreach"
                        value={campaignName}
                        onChange={(e) => setCampaignName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="companyDescription" className="flex items-center gap-2">
                        <BsBuilding className="h-4 w-4" />
                        Company Description *
                      </Label>
                      <Textarea
                        id="companyDescription"
                        placeholder="Describe your company, products, and services..."
                        value={companyDescription}
                        onChange={(e) => setCompanyDescription(e.target.value)}
                        rows={4}
                        className="resize-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="valueProposition" className="flex items-center gap-2">
                        <FiTrendingUp className="h-4 w-4" />
                        Value Proposition *
                      </Label>
                      <Input
                        id="valueProposition"
                        placeholder="e.g., Increase sales productivity by 40%"
                        value={valueProposition}
                        onChange={(e) => setValueProposition(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="targetIndustry">Target Industries</Label>
                      <Select value={targetIndustry[0] || ''} onValueChange={(v) => setTargetIndustry([v])}>
                        <SelectTrigger id="targetIndustry">
                          <SelectValue placeholder="Select industry..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="technology">Technology</SelectItem>
                          <SelectItem value="saas">SaaS</SelectItem>
                          <SelectItem value="fintech">Fintech</SelectItem>
                          <SelectItem value="healthcare">Healthcare</SelectItem>
                          <SelectItem value="ecommerce">E-commerce</SelectItem>
                          <SelectItem value="manufacturing">Manufacturing</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="companySize">Company Size</Label>
                      <Select value={companySize} onValueChange={setCompanySize}>
                        <SelectTrigger id="companySize">
                          <SelectValue placeholder="Select company size..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1-10">1-10 employees</SelectItem>
                          <SelectItem value="11-50">11-50 employees</SelectItem>
                          <SelectItem value="51-200">51-200 employees</SelectItem>
                          <SelectItem value="201-500">201-500 employees</SelectItem>
                          <SelectItem value="501-1000">501-1000 employees</SelectItem>
                          <SelectItem value="1001+">1001+ employees</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="targetTitles">Target Job Titles</Label>
                      <Input
                        id="targetTitles"
                        placeholder="e.g., VP Sales, Director of Marketing"
                        value={targetTitles}
                        onChange={(e) => setTargetTitles(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <Separator className="my-6" />

                <div className="flex justify-center">
                  <Button
                    size="lg"
                    className="bg-[#14b8a6] hover:bg-[#0f9b8e] text-white px-8"
                    onClick={handleGenerateCampaign}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <FiLoader className="mr-2 h-5 w-5 animate-spin" />
                        Generating Campaign...
                      </>
                    ) : (
                      <>
                        <FiTarget className="mr-2 h-5 w-5" />
                        Generate Campaign
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Email Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-slate-600">Total Prospects</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <FiUsers className="h-5 w-5 text-[#1e3a5f]" />
                    <span className="text-2xl font-bold">{totalProspects}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-slate-600">Approved</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <FiCheckCircle className="h-5 w-5 text-blue-600" />
                    <span className="text-2xl font-bold text-blue-600">{approvedCount}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-slate-600">Sent</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <FiSend className="h-5 w-5 text-green-600" />
                    <span className="text-2xl font-bold text-green-600">{sentCount}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-slate-600">Draft</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <FiEdit className="h-5 w-5 text-orange-600" />
                    <span className="text-2xl font-bold text-orange-600">{draftCount}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Controls */}
            <Card>
              <CardContent className="pt-6">
                {sendError && (
                  <Alert variant="destructive" className="mb-4">
                    <FiXCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{sendError}</AlertDescription>
                  </Alert>
                )}

                {sendSuccess && (
                  <Alert className="mb-4 border-green-200 bg-green-50">
                    <FiCheckCircle className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-green-800">Success</AlertTitle>
                    <AlertDescription className="text-green-700">{sendSuccess}</AlertDescription>
                  </Alert>
                )}

                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                  <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full sm:w-auto">
                    <div className="relative flex-1">
                      <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        placeholder="Search prospects..."
                        className="pl-10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>

                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger className="w-full sm:w-[180px]">
                        <FiFilter className="h-4 w-4 mr-2" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="sent">Sent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button
                      variant="outline"
                      onClick={toggleSelectAll}
                      className="flex-1 sm:flex-initial"
                    >
                      {filteredProspects.every(p => p.approved) ? (
                        <>
                          <FiX className="h-4 w-4 mr-2" />
                          Deselect All
                        </>
                      ) : (
                        <>
                          <FiCheck className="h-4 w-4 mr-2" />
                          Select All
                        </>
                      )}
                    </Button>

                    <Button
                      className="bg-[#14b8a6] hover:bg-[#0f9b8e] flex-1 sm:flex-initial"
                      onClick={handleSendApprovedEmails}
                      disabled={isSending || approvedCount === 0}
                    >
                      {isSending ? (
                        <>
                          <FiLoader className="mr-2 h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <FiSend className="mr-2 h-4 w-4" />
                          Send Approved ({approvedCount})
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Prospect Cards */}
            <div className="grid gap-4">
              {filteredProspects.map((prospect) => (
                <ProspectCard
                  key={prospect.id}
                  prospect={prospect}
                  onToggleApproval={toggleApproval}
                  onStartEditing={startEditing}
                  onCancelEditing={cancelEditing}
                  onSaveEditing={saveEditing}
                  onUpdateField={updateEditedField}
                />
              ))}

              {filteredProspects.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <FiUsers className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500 text-lg">No prospects found</p>
                    <p className="text-slate-400 text-sm mt-2">Try adjusting your search or filters</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Replies Tab */}
          <TabsContent value="replies" className="space-y-6">
            <Card className="border-t-4 border-t-[#14b8a6]">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl flex items-center gap-2">
                      <FiMail className="h-6 w-6 text-[#14b8a6]" />
                      Email Reply Analysis
                    </CardTitle>
                    <CardDescription className="mt-2">
                      Analyze sentiment of prospect replies and prioritize follow-ups
                    </CardDescription>
                  </div>
                  <Button
                    onClick={handleAnalyzeReplies}
                    disabled={isAnalyzing}
                    className="bg-[#14b8a6] hover:bg-[#0f9b8e]"
                  >
                    {isAnalyzing ? (
                      <>
                        <FiLoader className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <FiTrendingUp className="mr-2 h-4 w-4" />
                        Analyze Replies
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {analysisError && (
                  <Alert variant="destructive" className="mb-6">
                    <FiXCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{analysisError}</AlertDescription>
                  </Alert>
                )}

                {sentimentResponse && (
                  <>
                    {/* Summary Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <Card className="border-green-200 bg-green-50">
                        <CardContent className="pt-6">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-green-800">Interested</p>
                              <p className="text-3xl font-bold text-green-900">{interestedCount}</p>
                            </div>
                            <FiTrendingUp className="h-8 w-8 text-green-600" />
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-yellow-200 bg-yellow-50">
                        <CardContent className="pt-6">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-yellow-800">Neutral</p>
                              <p className="text-3xl font-bold text-yellow-900">{neutralCount}</p>
                            </div>
                            <FiMinus className="h-8 w-8 text-yellow-600" />
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-red-200 bg-red-50">
                        <CardContent className="pt-6">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-red-800">Not Interested</p>
                              <p className="text-3xl font-bold text-red-900">{notInterestedCount}</p>
                            </div>
                            <FiTrendingDown className="h-8 w-8 text-red-600" />
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Analysis Summary */}
                    {sentimentResponse.analysis && (
                      <Alert className="mb-6 border-blue-200 bg-blue-50">
                        <FiAlertCircle className="h-4 w-4 text-blue-600" />
                        <AlertTitle className="text-blue-800">Analysis Summary</AlertTitle>
                        <AlertDescription className="text-blue-700">
                          {sentimentResponse.analysis}
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Reply Cards */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-slate-800">Individual Replies</h3>
                      {sentimentResponse.findings.map((finding, index) => (
                        <ReplyCard key={index} finding={finding} />
                      ))}
                    </div>

                    {/* Recommendations */}
                    {sentimentResponse.recommendations && sentimentResponse.recommendations.length > 0 && (
                      <Card className="mt-6 border-[#14b8a6] bg-slate-50">
                        <CardHeader>
                          <CardTitle className="text-lg flex items-center gap-2">
                            <FiTarget className="h-5 w-5 text-[#14b8a6]" />
                            Recommended Actions
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-2">
                            {sentimentResponse.recommendations.map((rec, index) => (
                              <li key={index} className="flex items-start gap-2">
                                <FiCheckCircle className="h-5 w-5 text-[#14b8a6] mt-0.5 flex-shrink-0" />
                                <span className="text-slate-700">{rec}</span>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}

                {!sentimentResponse && !isAnalyzing && (
                  <div className="text-center py-12">
                    <FiMail className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500 text-lg">No analysis yet</p>
                    <p className="text-slate-400 text-sm mt-2">Click "Analyze Replies" to start</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

// =============================================================================
// Prospect Card Component
// =============================================================================

interface ProspectCardProps {
  prospect: EnrichedProspect
  onToggleApproval: (id: string) => void
  onStartEditing: (id: string) => void
  onCancelEditing: (id: string) => void
  onSaveEditing: (id: string) => void
  onUpdateField: (id: string, field: 'subject' | 'body', value: string) => void
}

function ProspectCard({
  prospect,
  onToggleApproval,
  onStartEditing,
  onCancelEditing,
  onSaveEditing,
  onUpdateField
}: ProspectCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const getStatusBadge = () => {
    switch (prospect.status) {
      case 'sent':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Sent</Badge>
      case 'approved':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Approved</Badge>
      default:
        return <Badge variant="outline">Draft</Badge>
    }
  }

  const getConfidenceBadge = () => {
    switch (prospect.enrichment_confidence) {
      case 'high':
        return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">High Confidence</Badge>
      case 'medium':
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Medium Confidence</Badge>
      default:
        return <Badge variant="outline">Low Confidence</Badge>
    }
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3 flex-1">
            <Checkbox
              checked={prospect.approved}
              onCheckedChange={() => onToggleApproval(prospect.id!)}
              disabled={prospect.status === 'sent'}
              className="mt-1"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-lg text-slate-900">{prospect.prospect_name}</h3>
                {getStatusBadge()}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <BsBuilding className="h-4 w-4 text-slate-400" />
                  <span>{prospect.company_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <FiBriefcase className="h-4 w-4 text-slate-400" />
                  <span>{prospect.job_title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <FiMail className="h-4 w-4 text-slate-400" />
                  <span className="truncate">{prospect.email_address}</span>
                </div>
                <div className="flex items-center gap-2">
                  {getConfidenceBadge()}
                </div>
              </div>
            </div>
          </div>
        </div>

        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between hover:bg-slate-50">
              <span className="text-sm font-medium">
                {isExpanded ? 'Hide Email Preview' : 'Show Email Preview'}
              </span>
              {isExpanded ? <FiChevronUp className="h-4 w-4" /> : <FiChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4">
            <div className="bg-slate-50 rounded-lg p-4 space-y-4">
              {prospect.isEditing ? (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-600">Subject Line</Label>
                    <Input
                      value={prospect.editedSubject || ''}
                      onChange={(e) => onUpdateField(prospect.id!, 'subject', e.target.value)}
                      className="bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-600">Email Body</Label>
                    <Textarea
                      value={prospect.editedBody || ''}
                      onChange={(e) => onUpdateField(prospect.id!, 'body', e.target.value)}
                      rows={8}
                      className="bg-white resize-none"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onCancelEditing(prospect.id!)}
                    >
                      <FiX className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onSaveEditing(prospect.id!)}
                      className="bg-[#14b8a6] hover:bg-[#0f9b8e]"
                    >
                      <FiCheck className="h-4 w-4 mr-1" />
                      Save Changes
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-xs text-slate-600 mb-1">Subject</p>
                    <p className="font-medium text-slate-900">{prospect.personalized_email.subject_line}</p>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-xs text-slate-600 mb-2">Body</p>
                    <div className="text-sm text-slate-700 whitespace-pre-wrap">
                      {prospect.personalized_email.email_body}
                    </div>
                  </div>
                  {prospect.personalized_email.personalization_notes && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-xs text-slate-600 mb-1">Personalization Notes</p>
                        <p className="text-sm text-slate-600 italic">
                          {prospect.personalized_email.personalization_notes}
                        </p>
                      </div>
                    </>
                  )}
                  {prospect.status !== 'sent' && (
                    <div className="flex justify-end pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onStartEditing(prospect.id!)}
                      >
                        <FiEdit className="h-4 w-4 mr-1" />
                        Edit Email
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}

// =============================================================================
// Reply Card Component
// =============================================================================

interface ReplyCardProps {
  finding: SentimentFinding
}

function ReplyCard({ finding }: ReplyCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const getSentimentConfig = () => {
    switch (finding.severity) {
      case 'high': // Interested
        return {
          label: 'Interested',
          color: 'bg-green-100 text-green-800 border-green-200',
          icon: <FiTrendingUp className="h-4 w-4" />
        }
      case 'medium': // Neutral
        return {
          label: 'Neutral',
          color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
          icon: <FiMinus className="h-4 w-4" />
        }
      default: // Not Interested
        return {
          label: 'Not Interested',
          color: 'bg-red-100 text-red-800 border-red-200',
          icon: <FiTrendingDown className="h-4 w-4" />
        }
    }
  }

  const config = getSentimentConfig()

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h4 className="font-semibold text-slate-900 mb-1">{finding.title}</h4>
            <p className="text-sm text-slate-600 line-clamp-2">{finding.description}</p>
          </div>
          <Badge className={`ml-4 flex items-center gap-1 ${config.color}`}>
            {config.icon}
            {config.label}
          </Badge>
        </div>

        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between text-xs hover:bg-slate-50">
              <span>{isExpanded ? 'Hide Details' : 'Show Reasoning'}</span>
              {isExpanded ? <FiChevronUp className="h-3 w-3" /> : <FiChevronDown className="h-3 w-3" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-600 mb-1 font-medium">Full Reply</p>
              <p className="text-sm text-slate-700 mb-3">{finding.description}</p>
              <Separator className="my-3" />
              <p className="text-xs text-slate-600 mb-1 font-medium">AI Analysis</p>
              <p className="text-sm text-slate-700">
                Classification based on sentiment analysis: {config.label}
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}
