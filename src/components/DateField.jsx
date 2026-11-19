export default function DateField({ className = '', type = 'date', ...props }) {
  return (
    <span className={`date-field ${className}`}>
      <input {...props} type={type} className="date-field-input" />
    </span>
  )
}
