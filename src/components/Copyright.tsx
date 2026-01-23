import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';

function Copyright() {
  return (
    <Typography
      variant="body2"
      align="center"
      sx={{
        color: 'text.secondary',
        marginTop: 2,
      }}
    >
      {'Copyright © '}
      <Link color="inherit" href="https://github.com/Kotkoa" className="no-underline">
        Kotkoa
      </Link>{' '}
      {new Date().getFullYear()}.
    </Typography>
  );
}

export default Copyright;
