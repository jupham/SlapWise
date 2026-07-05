import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { confirmSignUp, resendSignUpCode } from 'aws-amplify/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function ConfirmEmailPage() {
  const location = useLocation()
  const email: string = (location.state as { email?: string })?.email ?? ''
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [resent, setResent] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await confirmSignUp({ username: email, confirmationCode: code })
      navigate('/login')
    } catch {
      setError('Invalid code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    try {
      await resendSignUpCode({ username: email })
      setResent(true)
    } catch {
      setError('Could not resend code. Please try again.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We sent a confirmation code to <strong>{email}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {resent && (
              <Alert>
                <AlertDescription>Code resent. Check your inbox.</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1">
              <Label htmlFor="code">Confirmation code</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoComplete="one-time-code"
                inputMode="numeric"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Confirming…' : 'Confirm'}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={handleResend}>
              Resend code
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
