export async function GET() {
  return Response.json({
    cities: ["Visakhapatnam", "Hyderabad", "Chennai", "Bengaluru", "Mumbai", "Delhi", "Kolkata", "Goa", "Pune", "Jaipur"],
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    days: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
  });
}