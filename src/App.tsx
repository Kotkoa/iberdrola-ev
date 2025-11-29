import './App.css'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Copyright from './components/Copyright'

function App() {
  return (
    <Container maxWidth="sm">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" sx={{ mb: 2 }}>
          Material UI Vite example in TypeScript
        </Typography>
        <Copyright />
      </Box>
    </Container>
  )
}

export default App
